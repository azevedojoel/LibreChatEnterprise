/**
 * Process inbound email payload (agent lookup, conversation, run agent, send reply).
 * Uses the same agent execution path as the web UI (runAgentGeneration).
 */
const crypto = require('crypto');
const { logger } = require('@librechat/data-schemas');
const { EModelEndpoint, Constants } = require('librechat-data-provider');
const { GenerationJobManager } = require('@librechat/api');
const { getUserByInboundToken, findUser } = require('~/models');
const { getWorkspaceBySlug } = require('~/models/Workspace');
const { formatEmailContent } = require('~/server/utils/formatEmailHighlights');
const { sendInboundReply } = require('~/server/services/sendInboundReply');
const { initializeClient } = require('~/server/services/Endpoints/agents');
const { buildOptions } = require('~/server/services/Endpoints/agents/build');
const { runAgentGeneration } = require('~/server/controllers/agents/runAgentGeneration');
const addTitle = require('~/server/services/Endpoints/agents/title');
const { getConvoFiles } = require('~/models/Conversation');
const { processEmailAttachments } = require('./processEmailAttachments');
const db = require('~/models');
const { Conversation } = require('~/db/models');

const {
  parseRoutingToken,
  buildReplyToAddress,
  buildWorkspaceReplyTo,
} = require('./processInboundEmailUtils');

/**
 * Build agent ID -> friendly name map from the agent client (primary + handoff configs).
 * Used for displaying agent transfers in email replies.
 * @param {Object} [client] - AgentClient from initializeClient result
 * @returns {Record<string, string>}
 */
function buildAgentNamesFromClient(client) {
  const names = {};
  if (client?.options?.agent) {
    const primary = client.options.agent;
    names[primary.id] = primary.name || 'Assistant';
  }
  if (client?.agentConfigs) {
    for (const [agentId, config] of client.agentConfigs) {
      names[agentId] = config.name || config.id;
    }
  }
  return names;
}

/** Extract raw email from "Name" <email> or plain email string */
function extractEmailAddress(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  const angleMatch = trimmed.match(/<([^>]+)>/);
  return angleMatch ? angleMatch[1].trim() : trimmed;
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

  const fromEmail = payload.From ?? payload.FromFull?.Email ?? '';
  if (!fromEmail || !fromEmail.trim()) {
    logger.warn('[InboundEmail] No From address in payload');
    return;
  }
  const senderEmail = fromEmail.trim().toLowerCase();

  let targetUser = null;
  let isWorkspaceFlow = false;
  let workspaceSlug = null;

  // Try workspace lookup first (slug from To address, e.g. companyx@domain)
  const workspace = await getWorkspaceBySlug(userToken, '_id slug');
  if (workspace) {
    const senderUserByEmail = await findUser(
      { email: senderEmail },
      '_id role email workspace_id',
    );
    if (senderUserByEmail && senderUserByEmail.workspace_id?.toString() === workspace._id.toString()) {
      targetUser = senderUserByEmail;
      isWorkspaceFlow = true;
      workspaceSlug = workspace.slug;
    }
  }

  // Fall back to personal inboundEmailToken
  if (!targetUser) {
    targetUser = await getUserByInboundToken(userToken, '_id role email');
    if (!targetUser) {
      logger.warn('[InboundEmail] User not found for token', { token: userToken });
      return;
    }
    const targetEmail = (targetUser.email || '').trim().toLowerCase();
    if (senderEmail !== targetEmail) {
      logger.warn('[InboundEmail] Sender email does not match target user', {
        from: senderEmail,
        expected: targetEmail,
      });
      return;
    }
  }

  const senderUserId = targetUser._id?.toString?.() ?? targetUser._id;
  const senderUser = await findUser({ _id: senderUserId }, '_id role projectId workspace_id');
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
  const replyTo = isWorkspaceFlow
    ? buildWorkspaceReplyTo(originalRecipient, workspaceSlug, conversationId)
    : buildReplyToAddress(originalRecipient, userToken, conversationId);

  if (!replyTo) {
    logger.warn('[InboundEmail] Could not build Reply-To address', {
      hasOriginalRecipient: !!originalRecipient,
      isWorkspaceFlow,
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
    user: {
      id: senderUserId,
      role: senderUser.role,
      ...(senderUser.projectId && {
        projectId: senderUser.projectId?.toString?.() ?? senderUser.projectId,
      }),
    },
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
        addTitle,
        reqConversationId: parsedConversationId || 'new',
      },
    });

    const contentParts = response?.content ?? [];
    const agentNames = buildAgentNamesFromClient(result.client);
    const { html: emailHtml, text: emailText } = formatEmailContent(contentParts, capturedOAuthUrls, {
      appName: process.env.APP_TITLE || 'Daily Thread',
      agentName: agent?.name,
      agentNames,
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

  // Send reply first so user receives it even if persistence hangs or fails
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

  // Persistence after send (non-blocking; failures logged but reply already sent)
  try {
    logger.info('[InboundEmail] Step: fetching convo files');
    const { saveConvo } = require('~/models/Conversation');
    const existingFileIds = (await getConvoFiles(conversationId)) ?? [];
    const allFileIds = [...existingFileIds, ...requestFiles.map((f) => f.file_id)];

    logger.info('[InboundEmail] Step: saving conversation');
    await saveConvo(
      syntheticReq,
      {
        conversationId,
        endpoint: EModelEndpoint.agents,
        agentId: agent.id,
        model: agent.model,
        files: allFileIds,
      },
      { context: 'InboundEmail - save conversation' },
    );

    logger.info('[InboundEmail] Step: updating conversation tags');
    await Conversation.updateOne(
      { conversationId, user: senderUserId },
      { $addToSet: { tags: 'inbound_email' } },
    );
    logger.info('[InboundEmail] Step: persistence complete');
  } catch (persistErr) {
    logger.error('[InboundEmail] Persistence failed (reply already sent)', persistErr);
  }
}

module.exports = {
  processInboundEmail,
};
