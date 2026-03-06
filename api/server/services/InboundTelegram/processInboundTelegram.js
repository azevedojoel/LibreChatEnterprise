/**
 * Process inbound Telegram update (connect flow or run agent, send reply).
 * User-scoped: chatId → userId. Uses same agent execution path as personal inbound email.
 */
const crypto = require('crypto');
const { logger } = require('@librechat/data-schemas');
const { EModelEndpoint, Constants } = require('librechat-data-provider');
const { GenerationJobManager } = require('@librechat/api');
const { findUser } = require('~/models');
const {
  formatEmailContent,
  formatToolApprovalEmail,
  buildToolApprovalSubject,
} = require('~/server/utils/formatEmailHighlights');
const { sendTelegramReply } = require('~/server/services/sendTelegramReply');
const { consumeTelegramConnectToken } = require('~/server/utils/telegramConnectToken');
const { initializeClient } = require('~/server/services/Endpoints/agents');
const { buildOptions } = require('~/server/services/Endpoints/agents/build');
const { runAgentGeneration } = require('~/server/controllers/agents/runAgentGeneration');
const addTitle = require('~/server/services/Endpoints/agents/title');
const { getConvoFiles } = require('~/models/Conversation');
const db = require('~/models');
const { TelegramLink, Agent, Conversation } = require('~/db/models');
const { CacheKeys } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');

const baseUrl = process.env.DOMAIN_CLIENT || process.env.DOMAIN_SERVER || 'http://localhost:3080';

/**
 * Extract message from Telegram Update (message or edited_message).
 * @param {Object} update - Telegram Update object
 * @returns {{ chatId: number, messageId: number, text: string } | null}
 */
function extractMessage(update) {
  const msg = update.message || update.edited_message;
  if (!msg || !msg.chat) return null;
  const text = (msg.text || msg.caption || '').trim();
  return {
    chatId: msg.chat.id,
    messageId: msg.message_id,
    text,
  };
}

/**
 * Parse /start parameter. message.text = "/start abc123" or "/start"
 * @param {string} text
 * @returns {string | null} The parameter after "start " or null
 */
function parseStartParam(text) {
  if (!text || !text.startsWith('/start')) return null;
  const rest = text.slice(6).trim();
  return rest || null;
}

/**
 * Handle /start with connect token - link chatId to userId.
 */
async function handleConnectFlow(chatId, tokenParam) {
  const payload = await consumeTelegramConnectToken(tokenParam);
  if (!payload) {
    await sendTelegramReply({
      chatId,
      text: 'This link has expired. Please go to Settings and connect again.',
    });
    return;
  }

  const { userId } = payload;

  await TelegramLink.findOneAndUpdate(
    { chatId: String(chatId) },
    { $set: { userId, conversationId: null, updatedAt: new Date() } },
    { upsert: true, new: true },
  );

  await sendTelegramReply({
    chatId,
    text: 'Connected! You can now chat with your agent.',
  });

  logger.info('[InboundTelegram] Linked chatId to userId', { chatId, userId });
}

/**
 * Handle /new - clear conversationId so next message starts a fresh thread.
 */
async function handleNewConversation(chatId) {
  const link = await TelegramLink.findOne({ chatId: String(chatId) }).lean();
  if (!link) {
    logger.info('[InboundTelegram] /new command: chatId not linked', { chatId });
    await sendTelegramReply({
      chatId,
      text: `Please connect your account first. Go to Settings → Connect Telegram.\n\n${baseUrl}`,
    });
    return;
  }

  const previousConversationId = link.conversationId ?? null;
  await TelegramLink.updateOne(
    { chatId: String(chatId) },
    { $set: { conversationId: null, updatedAt: new Date() } },
  );

  logger.info('[InboundTelegram] /new command: conversation cleared', {
    chatId,
    userId: link.userId?.toString?.() ?? link.userId,
    previousConversationId,
  });

  await sendTelegramReply({
    chatId,
    text: 'Started a new conversation. Send your message.',
  });
}

/**
 * Process regular message - run agent and send reply.
 */
async function processMessage(chatId, messageId, messageText) {
  const link = await TelegramLink.findOne({ chatId: String(chatId) }).lean();
  if (!link) {
    await sendTelegramReply({
      chatId,
      text: `Please connect your account first. Go to Settings → Connect Telegram.\n\n${baseUrl}`,
    });
    return;
  }

  const userId = link.userId?.toString?.() ?? link.userId;
  const senderUser = await findUser({ _id: userId }, '_id role projectId workspace_id');
  if (!senderUser) {
    await sendTelegramReply({
      chatId,
      text: 'Your account could not be found. Please reconnect in Settings.',
    });
    return;
  }

  const { getAppConfig } = require('~/server/services/Config');
  const appConfig = await getAppConfig();
  const agentsConfig = appConfig?.endpoints?.[EModelEndpoint.agents];
  const defaultAgentId = agentsConfig?.defaultAgentForInboundEmail;

  if (!defaultAgentId) {
    logger.warn('[InboundTelegram] No defaultAgentForInboundEmail configured');
    await sendTelegramReply({
      chatId,
      text: 'Agent is not configured. Please contact support.',
    });
    return;
  }

  const agent = await Agent.findOne({ id: defaultAgentId })
    .populate('author', 'id name email')
    .lean();
  if (!agent) {
    logger.warn('[InboundTelegram] System agent not found', { agentId: defaultAgentId });
    await sendTelegramReply({
      chatId,
      text: 'Agent is not available. Please try again later.',
    });
    return;
  }

  const conversationId = link.conversationId || crypto.randomUUID();
  const senderUserId = senderUser._id?.toString?.() ?? senderUser._id;

  let parentMessageId = Constants.NO_PARENT;
  const existingMessages = await db.getMessages(
    { conversationId, user: senderUserId },
    'messageId parentMessageId createdAt',
  );
  if (existingMessages && existingMessages.length > 0) {
    const lastMessage = existingMessages[existingMessages.length - 1];
    parentMessageId = lastMessage.messageId;
  }

  const body = {
    text: messageText,
    conversationId,
    parentMessageId,
    agent_id: agent.id,
    endpoint: EModelEndpoint.agents,
    endpointType: EModelEndpoint.agents,
    files: [],
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
    _inboundSource: 'telegram',
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
    logger.warn('[InboundTelegram] Failed to build endpoint options');
    await sendTelegramReply({ chatId, text: 'Failed to process. Please try again.' });
    return;
  }

  syntheticReq.body.endpointOption = endpointOption;

  const streamId = conversationId;
  const abortController = new AbortController();
  const capturedOAuthUrls = [];
  syntheticReq._resumableStreamId = streamId;
  syntheticReq._headlessOAuthUrls = capturedOAuthUrls;
  syntheticReq._headlessOAuthServers = new Set();
  syntheticReq._headlessSendApprovalEmail = async ({
    toolName,
    argsSummary,
    approvalUrl,
    conversationId: auditConversationId,
    runId: auditRunId,
    toolCallId: auditToolCallId,
    userId: auditUserId,
  }) => {
    const appName = process.env.APP_TITLE || 'Daily Thread';
    // Telegram may reject localhost URLs in inline buttons (BUTTON_URL_INVALID); use button only for public URLs
    const useInlineButton =
      approvalUrl &&
      approvalUrl.startsWith('http') &&
      !approvalUrl.includes('localhost') &&
      !approvalUrl.includes('127.0.0.1');
    const { text } = formatToolApprovalEmail(
      { toolName, argsSummary, approvalUrl },
      { appName, forTelegram: true, useInlineButton },
    );
    const subject = buildToolApprovalSubject({ toolName, argsSummary }, { appName });
    const reply_markup = useInlineButton
      ? { inline_keyboard: [[{ text: 'Approve or Deny', url: approvalUrl }]] }
      : undefined;
    await sendTelegramReply({
      chatId,
      text: `${subject}\n\n${text}`,
      reply_markup,
    });
  };

  let replyText = '';

  try {
    const job = await GenerationJobManager.createJob(streamId, senderUserId, conversationId);

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
        reqConversationId: link.conversationId ? 'existing' : 'new',
      },
    });

    const contentParts = response?.content ?? [];
    const { text: emailText } = formatEmailContent(contentParts, capturedOAuthUrls, {
      appName: process.env.APP_TITLE || 'Daily Thread',
      agentName: agent?.name,
      forTelegram: true,
    });

    replyText = emailText || '(No response content)';
  } catch (err) {
    logger.error('[InboundTelegram] Run failed', err);
    let errorContent =
      'We encountered an error while processing your request.\n\nPlease try again or contact support if the issue persists.';
    if (/oauth|auth|reconnect|integration|authenticate/i.test(String(err?.message))) {
      errorContent += `\n\nIf an integration needs re-authentication, sign in at ${baseUrl} and reconnect it under Settings.`;
    }
    replyText = errorContent;
  }

  const sendResult = await sendTelegramReply({
    chatId,
    text: replyText,
  });

  if (!sendResult.success) {
    logger.error('[InboundTelegram] Failed to send reply:', sendResult.error);
  }

  await TelegramLink.updateOne(
    { chatId: String(chatId) },
    { $set: { conversationId, updatedAt: new Date() } },
  );

  try {
    const { saveConvo } = require('~/models/Conversation');
    const existingFileIds = (await getConvoFiles(conversationId)) ?? [];
    await saveConvo(
      syntheticReq,
      {
        conversationId,
        endpoint: EModelEndpoint.agents,
        agentId: agent.id,
        model: agent.model,
        files: existingFileIds,
      },
      { context: 'InboundTelegram - save conversation' },
    );

    await Conversation.updateOne(
      { conversationId, user: senderUserId },
      { $addToSet: { tags: 'inbound_telegram' } },
    );
  } catch (persistErr) {
    logger.error('[InboundTelegram] Persistence failed (reply already sent)', persistErr);
  }
}

/**
 * Process a single Telegram Update.
 * Uses update_id for idempotency to avoid duplicate processing on job retries.
 * @param {Object} update - Telegram Update object
 */
async function processInboundTelegram(update) {
  const updateId = update?.update_id;
  if (updateId != null) {
    try {
      const processedCache = getLogStores(CacheKeys.TELEGRAM_PROCESSED_UPDATES);
      const alreadyProcessed = await processedCache.get(`telegram:update:${updateId}`);
      if (alreadyProcessed) {
        logger.debug('[InboundTelegram] Update already processed, skipping', { updateId });
        return;
      }
      await processedCache.set(`telegram:update:${updateId}`, '1');
    } catch (err) {
      logger.warn('[InboundTelegram] Idempotency check failed, proceeding', { updateId, err: err?.message });
    }
  }

  const msg = extractMessage(update);
  if (!msg) {
    logger.debug('[InboundTelegram] No message in update, skipping');
    return;
  }

  const { chatId, messageId, text } = msg;

  const startParam = parseStartParam(text);
  if (startParam) {
    await handleConnectFlow(chatId, startParam);
    return;
  }

  if (/^\/new(\s|$)/i.test(text)) {
    logger.info('[InboundTelegram] /new command received', { chatId, text: text.slice(0, 50) });
    await handleNewConversation(chatId);
    return;
  }

  if (!text) {
    await sendTelegramReply({
      chatId,
      text: 'Please send a text message. Photos and other media are not supported yet.',
    });
    return;
  }

  await processMessage(chatId, messageId, text);
}

module.exports = {
  processInboundTelegram,
};
