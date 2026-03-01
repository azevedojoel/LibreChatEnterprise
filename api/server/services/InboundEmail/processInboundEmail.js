/**
 * Process inbound email payload (agent lookup, conversation, run agent, send reply).
 * Uses the same agent execution path as the web UI (runAgentGeneration).
 */
const crypto = require('crypto');
const { logger } = require('@librechat/data-schemas');
const { EModelEndpoint, Constants } = require('librechat-data-provider');
const { GenerationJobManager } = require('@librechat/api');
const { getUserByInboundToken, findUser } = require('~/models');
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

/** Extract user token and optional conversationId from MailboxHash or To local part */
function parseRoutingToken(mailboxHash, toAddress) {
  let token = null;
  let conversationId = null;
  if (mailboxHash && typeof mailboxHash === 'string') {
    const trimmed = mailboxHash.trim();
    if (trimmed) {
      const parts = trimmed.split(MAILBOX_HASH_DELIMITER);
      if (parts.length >= 2) {
        token = parts[0];
        conversationId = parts[1];
      } else {
        token = trimmed;
      }
    }
  }
  if (!token && toAddress) {
    const fullLocal = (toAddress.split('@')[0] || '').trim();
    const afterPlus = fullLocal.includes('+') ? fullLocal.split('+').slice(1).join('+') : fullLocal;
    if (afterPlus) {
      const parts = afterPlus.split(MAILBOX_HASH_DELIMITER);
      token = parts[0] || null;
      conversationId = parts[1] || null;
    }
  }
  return { token, conversationId };
}

function buildReplyToAddress(originalRecipient, userToken, conversationId) {
  if (!originalRecipient || !userToken || !conversationId) {
    return null;
  }
  try {
    const atIdx = originalRecipient.indexOf('@');
    if (atIdx === -1) {
      return null;
    }
    const domain = originalRecipient.slice(atIdx);
    const localPart = originalRecipient.slice(0, atIdx);
    const hash = localPart.split('+')[0] || localPart;
    return `${hash}+${userToken}${MAILBOX_HASH_DELIMITER}${conversationId}${domain}`;
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
 * Routes by user inboundEmailToken; uses system agent from config.
 * @param {Object} payload - Parsed Postmark webhook JSON
 */
async function processInboundEmail(payload) {
  const { getAppConfig } = require('~/server/services/Config');
  const appConfig = await getAppConfig();
  const agentsConfig = appConfig?.endpoints?.[EModelEndpoint.agents];
  const defaultAgentId = agentsConfig?.defaultAgentForInboundEmail;

  if (!defaultAgentId) {
    logger.warn('[InboundEmail] No defaultAgentForInboundEmail configured in endpoints.agents');
    return;
  }

  const mailboxHash = payload.MailboxHash ?? payload.Mailboxhash ?? '';
  const originalRecipient =
    payload.OriginalRecipient ??
    (Array.isArray(payload.ToFull) && payload.ToFull[0]?.Email
      ? payload.ToFull[0].Email
      : extractEmailAddress(payload.To ?? '') || '');
  const { token: userToken, conversationId: parsedConversationId } = parseRoutingToken(
    mailboxHash,
    originalRecipient,
  );

  if (!userToken) {
    logger.warn('[InboundEmail] No user token in MailboxHash or To address');
    return;
  }

  const targetUser = await getUserByInboundToken(userToken, '_id role email');
  if (!targetUser) {
    logger.warn('[InboundEmail] User not found for token', { token: userToken });
    return;
  }

  const fromEmail = payload.From ?? payload.FromFull?.Email ?? '';
  if (!fromEmail || !fromEmail.trim()) {
    logger.warn('[InboundEmail] No From address in payload');
    return;
  }

  const senderEmail = fromEmail.trim().toLowerCase();
  const targetEmail = (targetUser.email || '').trim().toLowerCase();
  if (senderEmail !== targetEmail) {
    logger.warn('[InboundEmail] Sender email does not match target user', {
      from: senderEmail,
      expected: targetEmail,
    });
    return;
  }

  const senderUserId = targetUser._id?.toString?.() ?? targetUser._id;
  const senderUser = await findUser({ _id: senderUserId }, '_id role');
  if (!senderUser) {
    logger.warn('[InboundEmail] Sender user not found');
    return;
  }

  const Agent = require('~/db/models').Agent;
  const agent = await Agent.findOne({ id: defaultAgentId })
    .populate('author', 'id name email')
    .lean();
  if (!agent) {
    logger.warn('[InboundEmail] System agent not found', { agentId: defaultAgentId });
    return;
  }

  /** Use normal UUID for new threads; parsedConversationId from Reply-To for follow-ups */
  const conversationId = parsedConversationId || crypto.randomUUID();
  logger.info(
    `[InboundEmail] Processing email from=${fromEmail} agent=${agent?.name ?? 'unknown'} conv=${conversationId}`,
  );

  const subject = payload.Subject ?? '';

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
  const replyTo = buildReplyToAddress(originalRecipient, userToken, conversationId);

  if (!replyTo) {
    logger.warn('[InboundEmail] Could not build Reply-To address', {
      hasOriginalRecipient: !!originalRecipient,
      hasUserToken: !!userToken,
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
    syntheticReq._headlessOAuthUrls = capturedOAuthUrls;
    /** Tracks MCP servers we've already captured a URL for (deduplicates per-server) */
    syntheticReq._headlessOAuthServers = new Set();
    /** When set, sends approval email for destructive tools (headless flow) */
    syntheticReq._headlessSendApprovalEmail = async ({ toolName, argsSummary, approvalUrl }) => {
      const appName = process.env.APP_TITLE || 'Daily Thread';
      const subject = `${appName}: Tool approval required`;
      const body = `Your agent requested approval for a destructive action.\n\nTool: ${toolName}\n${argsSummary ? `Arguments: ${argsSummary}\n\n` : ''}To approve or deny, sign in and visit:\n${approvalUrl}\n\nThis link expires in 1 hour.`;
      const html = `<p>Your agent requested approval for a destructive action.</p><p><strong>Tool:</strong> ${toolName}</p>${argsSummary ? `<p><strong>Arguments:</strong> <code>${argsSummary}</code></p>` : ''}<p>To approve or deny, <a href="${approvalUrl}">sign in and visit this link</a>.</p><p><em>This link expires in 1 hour.</em></p>`;
      await sendInboundReply({ to: fromEmail, subject, body, html });
    };

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
      appName: process.env.APP_TITLE || 'Daily Thread',
      agentName: agent?.name,
      userMessage: messageText,
      fileNames: requestFiles.map((f) => f.filename),
    });

    logger.info('[InboundEmail] Building email reply', {
      capturedOAuthUrlsLength: capturedOAuthUrls.length,
      capturedOAuthUrlsPreview: capturedOAuthUrls.map((u) => u?.slice(0, 80) ?? ''),
    });

    emailBody = emailText || '(No response content)';
    emailHtmlBody = emailHtml || null;
    if (!emailBody || emailBody === '(No response content)') {
      emailBody = '(No response content)';
      // Preserve HTML when we have OAuth links so the sign-in button is included
      if (capturedOAuthUrls.length === 0) {
        emailHtmlBody = null;
      }
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
    const baseUrl = process.env.DOMAIN_CLIENT || process.env.DOMAIN_SERVER || 'http://localhost:3080';
    let errorContent =
      'We encountered an error while processing your request.\n\nPlease try again or contact support if the issue persists.';
    if (capturedOAuthUrls.length === 0 && /oauth|auth|reconnect|integration|authenticate/i.test(String(err?.message))) {
      errorContent += `\n\nIf an integration needs re-authentication, sign in at ${baseUrl} and reconnect it under Settings.`;
      capturedOAuthUrls.push(baseUrl);
    }
    logger.info('[InboundEmail] Error path - capturedOAuthUrls', {
      capturedOAuthUrlsLength: capturedOAuthUrls.length,
      capturedOAuthUrlsPreview: capturedOAuthUrls.map((u) => u?.slice(0, 80) ?? ''),
    });
    const { html: errorHtml, text: errorText } = formatEmailContent(
      [{ type: 'text', text: errorContent }],
      capturedOAuthUrls,
      {
        appName: process.env.APP_TITLE || 'Daily Thread',
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
