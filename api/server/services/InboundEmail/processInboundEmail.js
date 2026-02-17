/**
 * Process inbound email payload (agent lookup, conversation, run agent, send reply).
 * Uses the same agent execution path as the web UI (runAgentGeneration).
 */
const crypto = require('crypto');
const { logger } = require('@librechat/data-schemas');
const { EModelEndpoint, ResourceType, PermissionBits, Constants } = require('librechat-data-provider');
const { GenerationJobManager } = require('@librechat/api');
const { getAgentByInboundToken } = require('~/models/Agent');
const { findUser } = require('~/models');
const { checkPermission } = require('~/server/services/PermissionService');
const { formatEmailContent } = require('~/server/utils/formatEmailHighlights');
const { sendInboundReply } = require('~/server/services/sendInboundReply');
const { initializeClient } = require('~/server/services/Endpoints/agents');
const { buildOptions } = require('~/server/services/Endpoints/agents/build');
const { runAgentGeneration } = require('~/server/controllers/agents/runAgentGeneration');
const { getConvoFiles } = require('~/models/Conversation');
const { processEmailAttachments } = require('./processEmailAttachments');
const db = require('~/models');

const MAILBOX_HASH_DELIMITER = '__';

/** Extract raw email from "Name" <email> or plain email string */
function extractEmailAddress(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  const angleMatch = trimmed.match(/<([^>]+)>/);
  return angleMatch ? angleMatch[1].trim() : trimmed;
}

function parseMailboxHash(mailboxHash) {
  if (!mailboxHash || typeof mailboxHash !== 'string') {
    return { agentToken: null, conversationId: null };
  }
  const trimmed = mailboxHash.trim();
  if (!trimmed) {
    return { agentToken: null, conversationId: null };
  }
  const parts = trimmed.split(MAILBOX_HASH_DELIMITER);
  if (parts.length >= 2) {
    return { agentToken: parts[0], conversationId: parts[1] };
  }
  return { agentToken: trimmed, conversationId: null };
}

function buildReplyToAddress(originalRecipient, agentToken, conversationId) {
  if (!originalRecipient || !agentToken || !conversationId) {
    return null;
  }
  try {
    const atIdx = originalRecipient.indexOf('@');
    if (atIdx === -1) {
      return null;
    }
    const localPart = originalRecipient.slice(0, atIdx);
    const domain = originalRecipient.slice(atIdx);
    const hash = localPart.split('+')[0] || localPart;
    return `${hash}+${agentToken}${MAILBOX_HASH_DELIMITER}${conversationId}${domain}`;
  } catch {
    return null;
  }
}

function stripHtml(html) {
  if (!html || typeof html !== 'string') {
    return '';
  }
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Process a single inbound email payload.
 * @param {Object} payload - Parsed Postmark webhook JSON
 */
async function processInboundEmail(payload) {
  const mailboxHash = payload.MailboxHash ?? payload.Mailboxhash ?? '';
  const { agentToken, conversationId: parsedConversationId } = parseMailboxHash(mailboxHash);

  const defaultAgentToken = process.env.INBOUND_EMAIL_DEFAULT_AGENT_TOKEN;
  const resolvedAgentToken = agentToken || defaultAgentToken;

  if (!resolvedAgentToken) {
    logger.warn('[InboundEmail] No agent token in MailboxHash and no default configured');
    return;
  }

  const agent = await getAgentByInboundToken(resolvedAgentToken);
  if (!agent) {
    logger.warn('[InboundEmail] Agent not found for token');
    return;
  }

  const fromEmail = payload.From ?? payload.FromFull?.Email ?? '';
  if (!fromEmail || !fromEmail.trim()) {
    logger.warn('[InboundEmail] No From address in payload');
    return;
  }

  const senderUser = await findUser({ email: fromEmail.trim() }, '_id role');
  if (!senderUser) {
    logger.warn('[InboundEmail] Sender email not found as LibreChat user', { email: fromEmail });
    return;
  }

  const senderUserId = senderUser._id?.toString?.() ?? senderUser._id;
  const authorId = agent.author?._id?.toString?.() ?? agent.author?.toString?.() ?? agent.author;
  const hasAccess =
    authorId === senderUserId ||
    (await checkPermission({
      userId: senderUserId,
      role: senderUser.role,
      resourceType: ResourceType.AGENT,
      resourceId: agent._id,
      requiredPermission: PermissionBits.VIEW,
    }));

  if (!hasAccess) {
    logger.warn('[InboundEmail] Sender does not have access to agent', {
      email: fromEmail,
      agentId: agent.id,
    });
    return;
  }

  /** Use normal UUID for new threads; parsedConversationId from Reply-To for follow-ups */
  const conversationId = parsedConversationId || crypto.randomUUID();
  logger.info(
    `[InboundEmail] Processing email from=${fromEmail} agent=${agent?.name ?? 'unknown'} conv=${conversationId}`,
  );

  const subject = payload.Subject ?? '';
  const originalRecipient =
    payload.OriginalRecipient ??
    (Array.isArray(payload.ToFull) && payload.ToFull[0]?.Email
      ? payload.ToFull[0].Email
      : extractEmailAddress(payload.To ?? '') || '');

  let messageText =
    payload.StrippedTextReply ||
    payload.TextBody ||
    (payload.HtmlBody ? stripHtml(payload.HtmlBody) : '');

  if (subject && messageText) {
    messageText = `Subject: ${subject}\n\n${messageText}`;
  } else if (subject) {
    messageText = `Subject: ${subject}`;
  }

  if (!messageText || !messageText.trim()) {
    logger.warn('[InboundEmail] Empty message body');
    return;
  }

  const { getAppConfig } = require('~/server/services/Config');
  const appConfig = await getAppConfig();

  if (parsedConversationId) {
    const { searchConversation } = require('~/models/Conversation');
    const existing = await searchConversation(parsedConversationId);
    if (existing && existing.user?.toString() !== senderUserId) {
      logger.warn('[InboundEmail] Conversation belongs to different user');
      return;
    }
  }

  const requestFiles = await processEmailAttachments({
    attachments: payload.Attachments ?? [],
    userId: senderUserId,
    appConfig,
  });

  if (requestFiles.length > 0) {
    const fileList = requestFiles.map((f) => f.filename).join(', ');
    const attachmentHint = `[Attached file(s) saved and available via file_search: ${fileList}]`;
    messageText = `${attachmentHint}\n\n${messageText}`;
  }

  let parentMessageId = Constants.NO_PARENT;
  if (parsedConversationId) {
    const existingMessages = await db.getMessages(
      { conversationId, user: senderUserId },
      'messageId parentMessageId createdAt',
    );
    if (existingMessages && existingMessages.length > 0) {
      const lastMessage = existingMessages[existingMessages.length - 1];
      parentMessageId = lastMessage.messageId;
    }
  }

  const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
  const replyAgentToken = agent.inboundEmailToken ?? resolvedAgentToken;
  const replyTo = buildReplyToAddress(originalRecipient, replyAgentToken, conversationId);

  if (!replyTo) {
    logger.warn('[InboundEmail] Could not build Reply-To address', {
      hasOriginalRecipient: !!originalRecipient,
      hasAgentToken: !!replyAgentToken,
      conversationId,
    });
  }

  const capturedOAuthUrls = [];

  const body = {
    text: messageText,
    conversationId,
    parentMessageId,
    agent_id: agent.id,
    endpoint: EModelEndpoint.agents,
    endpointType: EModelEndpoint.agents,
    files: requestFiles,
  };

  const syntheticReq = {
    user: { id: senderUserId, role: senderUser.role },
    config: appConfig,
    body,
  };

  const parsedBody = {
    endpoint: EModelEndpoint.agents,
    endpointType: EModelEndpoint.agents,
    agent_id: agent.id,
    ...(agent.model_parameters && { ...agent.model_parameters }),
  };

  const endpointOption = await buildOptions(
    syntheticReq,
    EModelEndpoint.agents,
    parsedBody,
    EModelEndpoint.agents,
  );

  if (!endpointOption?.agent) {
    logger.warn('[InboundEmail] Failed to build endpoint options');
    return;
  }

  syntheticReq.body.endpointOption = endpointOption;

  const streamId = conversationId;
  const abortController = new AbortController();

  let emailBody = '';
  let emailHtmlBody = null;

  try {
    const job = await GenerationJobManager.createJob(streamId, senderUserId, conversationId);
    syntheticReq._resumableStreamId = streamId;

    const result = await initializeClient({
      req: syntheticReq,
      res: {},
      signal: abortController.signal,
      endpointOption,
    });

    if (result.client?.contentParts) {
      GenerationJobManager.setContentParts(streamId, result.client.contentParts);
    }

    const { response } = await runAgentGeneration({
      req: syntheticReq,
      userId: senderUserId,
      conversationId,
      streamId,
      endpointOption,
      job,
      result,
      options: {
        text: messageText,
        parentMessageId,
        isHeadless: true,
        capturedOAuthUrls,
      },
    });

    const contentParts = response?.content ?? [];
    const { html: emailHtml, text: emailText } = formatEmailContent(contentParts, capturedOAuthUrls, {
      appName: process.env.APP_TITLE || 'LibreChat',
      agentName: agent?.name,
      userMessage: messageText,
    });

    logger.info('[InboundEmail] Building email reply', {
      capturedOAuthUrlsLength: capturedOAuthUrls.length,
      capturedOAuthUrlsPreview: capturedOAuthUrls.map((u) => u?.slice(0, 80) ?? ''),
    });

    emailBody = emailText || '(No response content)';
    emailHtmlBody = emailHtml || null;
    if (!emailBody || emailBody === '(No response content)') {
      emailBody = '(No response content)';
      emailHtmlBody = null;
    }

    const { saveConvo } = require('~/models/Conversation');
    const existingFileIds = (await getConvoFiles(conversationId)) ?? [];
    const allFileIds = [...existingFileIds, ...requestFiles.map((f) => f.file_id)];

    await saveConvo(
      syntheticReq,
      {
        conversationId,
        endpoint: EModelEndpoint.agents,
        agentId: agent.id,
        title: agent.name || `Email from ${fromEmail}`,
        model: agent.model,
        files: allFileIds,
      },
      { context: 'InboundEmail - save conversation' },
    );
  } catch (err) {
    logger.error('[InboundEmail] Run failed', err);
    const errorMessage =
      'We encountered an error while processing your request.\n\nPlease try again or contact support if the issue persists.';
    logger.info('[InboundEmail] Error path - capturedOAuthUrls', {
      capturedOAuthUrlsLength: capturedOAuthUrls.length,
      capturedOAuthUrlsPreview: capturedOAuthUrls.map((u) => u?.slice(0, 80) ?? ''),
    });
    const { html: errorHtml, text: errorText } = formatEmailContent(
      [{ type: 'text', text: errorMessage }],
      capturedOAuthUrls,
      {
        appName: process.env.APP_TITLE || 'LibreChat',
        agentName: agent?.name,
        userMessage: messageText,
      },
    );
    emailBody = errorText;
    emailHtmlBody = errorHtml;
  }

  logger.info(
    `[InboundEmail] Sending reply to=${fromEmail} bodyLength=${emailBody?.length ?? 0}`,
  );
  const sendResult = await sendInboundReply({
    to: fromEmail,
    subject: replySubject,
    body: emailBody || '(No response content)',
    html: emailHtmlBody,
    replyTo,
  });
  logger.info(`[InboundEmail] Reply sent success=${sendResult.success}`);
  if (!sendResult.success) {
    logger.error('[InboundEmail] Failed to send reply:', sendResult.error);
  }
}

module.exports = {
  processInboundEmail,
};
