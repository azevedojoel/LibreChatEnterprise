/**
 * Process inbound email payload (agent lookup, conversation, run agent, send reply).
 * Called by BullMQ worker; extracted from inboundEmail controller.
 */
const { nanoid } = require('nanoid');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');
const {
  EModelEndpoint,
  ResourceType,
  PermissionBits,
  Constants,
} = require('librechat-data-provider');
const {
  Callback,
  ToolEndHandler,
  ChatModelStreamHandler,
  formatAgentMessages,
} = require('@librechat/agents');
const {
  createRun,
  buildToolSet,
  createSafeUser,
  initializeAgent,
  getBalanceConfig,
  recordCollectedUsage,
  getTransactionsConfig,
  createToolExecuteHandler,
  createOpenAIContentAggregator,
} = require('@librechat/api');
const { createToolEndCallback } = require('~/server/controllers/agents/callbacks');
const { loadAgentTools, loadToolsForExecution } = require('~/server/services/ToolService');
const { getConvoFiles, saveConvo, searchConversation } = require('~/models/Conversation');
const { processEmailAttachments } = require('./processEmailAttachments');
const { spendTokens, spendStructuredTokens } = require('~/models/spendTokens');
const { getAgentByInboundToken } = require('~/models/Agent');
const { findUser } = require('~/models');
const { checkPermission } = require('~/server/services/PermissionService');
const { formatEmailHighlights } = require('~/server/utils/formatEmailHighlights');
const { sendInboundReply } = require('~/server/services/sendInboundReply');
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

async function loadPreviousMessages(conversationId, userId) {
  try {
    const messages = await db.getMessages({ conversationId, user: userId });
    if (!messages || messages.length === 0) {
      return [];
    }
    return messages.map((msg) => {
      let content =
        typeof msg.text === 'string'
          ? msg.text
          : Array.isArray(msg.content)
            ? msg.content
            : msg.text
              ? String(msg.text)
              : '';
      /** API rejects messages with empty text content blocks; use placeholder when empty */
      if (typeof content === 'string' && !content.trim()) {
        content = ' ';
      } else if (Array.isArray(content)) {
        const hasNonEmptyText = content.some(
          (p) => p?.type === 'text' && (p?.text ?? p?.content ?? '').toString().trim().length > 0,
        );
        if (!hasNonEmptyText) {
          content = ' ';
        }
      }
      return {
        role: msg.isCreatedByUser ? 'user' : 'assistant',
        content,
        messageId: msg.messageId,
      };
    });
  } catch (error) {
    logger.error('[InboundEmail] Error loading messages:', error);
    return [];
  }
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

  const conversationId =
    parsedConversationId ||
    (payload.MessageID ? `inbound-${payload.MessageID}` : uuidv4());
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
  const syntheticReq = {
    user: { id: senderUserId },
    config: appConfig,
    body: {},
  };

  if (parsedConversationId) {
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

  const userMessageId = nanoid();
  const existingFileIds = (await getConvoFiles(conversationId)) ?? [];
  const allFileIds = [...existingFileIds, ...requestFiles.map((f) => f.file_id)];

  const previousMessages = await loadPreviousMessages(conversationId, senderUserId);
  const newUserMessage = {
    role: 'user',
    content: messageText,
    messageId: userMessageId,
  };
  const allMessages = [...previousMessages, newUserMessage];

  const abortController = new AbortController();
  const loadTools = async ({
    req: _req,
    res: _res,
    tools,
    model,
    agentId,
    provider,
    tool_options,
    tool_resources,
  }) => {
    const agentForTools = {
      id: agentId ?? agent.id,
      tools,
      provider,
      model,
      tool_options,
      tool_resources,
    };
    return loadAgentTools({
      req: syntheticReq,
      res: {},
      agent: agentForTools,
      signal: abortController.signal,
      tool_resources: tool_resources ?? {},
      definitionsOnly: false,
      streamId: null,
    });
  };

  const endpointOption = {
    endpoint: agent.provider,
    model_parameters: agent.model_parameters ?? {},
  };

  const allowedProviders = new Set(
    appConfig?.endpoints?.[EModelEndpoint.agents]?.allowedProviders,
  );

  const primaryConfig = await initializeAgent(
    {
      req: syntheticReq,
      res: {},
      loadTools,
      requestFiles,
      conversationId,
      parentMessageId: userMessageId,
      agent,
      endpointOption,
      allowedProviders,
      isInitialAgent: true,
    },
    {
      getConvoFiles,
      getFiles: db.getFiles,
      getUserKey: db.getUserKey,
      getMessages: db.getMessages,
      updateFilesUsage: db.updateFilesUsage,
      getUserKeyValues: db.getUserKeyValues,
      getUserCodeFiles: db.getUserCodeFiles,
      getToolFilesByIds: db.getToolFilesByIds,
      getCodeGeneratedFiles: db.getCodeGeneratedFiles,
    },
  );

  const toolSet = buildToolSet(primaryConfig);
  const { messages: formattedMessages, indexTokenCountMap } = formatAgentMessages(
    allMessages,
    {},
    toolSet,
  );

  const aggregator = createOpenAIContentAggregator();
  const collectedUsage = [];
  const artifactPromises = [];
  const toolEndCallback = createToolEndCallback({
    req: syntheticReq,
    res: {},
    artifactPromises,
    streamId: null,
  });

  const capturedOAuthUrls = [];
  const toolExecuteOptions = {
    loadTools: async (toolNames) => {
      return loadToolsForExecution({
        req: syntheticReq,
        res: {},
        agent,
        toolNames,
        signal: abortController.signal,
        toolRegistry: primaryConfig.toolRegistry,
        userMCPAuthMap: primaryConfig.userMCPAuthMap,
        tool_resources: primaryConfig.tool_resources,
      });
    },
    toolEndCallback,
    captureOAuthUrl: (url) => {
      if (url && !capturedOAuthUrls.includes(url)) {
        capturedOAuthUrls.push(url);
      }
    },
  };

  const chatModelStreamHandler = new ChatModelStreamHandler();

  const createHandler = (processor) => ({
    handle: (_event, data) => {
      if (processor) {
        processor(data);
      }
    },
  });

  const handlers = {
    on_chat_model_stream: {
      handle: async (event, data, metadata, graph) => {
        await chatModelStreamHandler.handle(event, data, metadata, graph);
      },
    },
    on_message_delta: createHandler((data) => {
      const content = data?.delta?.content;
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part.type === 'text' && part.text) {
            aggregator.addText(part.text);
          }
        }
      }
    }),
    on_reasoning_delta: createHandler((data) => {
      const content = data?.delta?.content;
      if (Array.isArray(content)) {
        for (const part of content) {
          const text = part.think ?? part.text;
          if (text) {
            aggregator.addReasoning(text);
          }
        }
      }
    }),
    on_run_step: createHandler((data) => {
      const stepDetails = data?.stepDetails;
      if (stepDetails?.type === 'tool_calls' && stepDetails.tool_calls) {
        for (const tc of stepDetails.tool_calls) {
          const toolIndex = data.index ?? 0;
          const toolCall = {
            id: tc.id ?? '',
            type: 'function',
            function: { name: tc.name ?? '', arguments: '' },
          };
          if (!aggregator.toolCalls.has(toolIndex)) {
            aggregator.toolCalls.set(toolIndex, toolCall);
          }
        }
      }
    }),
    on_run_step_delta: createHandler((data) => {
      const delta = data?.delta;
      if (delta?.type === 'tool_calls' && delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const args = tc.args ?? '';
          if (!args) continue;
          const toolIndex = tc.index ?? 0;
          const tracked = aggregator.toolCalls.get(toolIndex);
          if (tracked?.function) {
            tracked.function.arguments += args;
          }
        }
      }
    }),
    on_chat_model_end: createHandler((data) => {
      const usage = data?.output?.usage_metadata;
      if (usage) {
        collectedUsage.push(usage);
        aggregator.usage.promptTokens += usage.input_tokens ?? 0;
        aggregator.usage.completionTokens += usage.output_tokens ?? 0;
      }
    }),
    on_run_step_completed: createHandler(),
    on_tool_end: new ToolEndHandler(toolEndCallback, logger),
    on_chain_stream: createHandler(),
    on_chain_end: createHandler(),
    on_agent_update: createHandler(),
    on_custom_event: createHandler(),
    on_tool_execute: createToolExecuteHandler(toolExecuteOptions),
  };

  const responseId = `chatcmpl-${nanoid()}`;
  const run = await createRun({
    agents: [primaryConfig],
    messages: formattedMessages,
    indexTokenCountMap,
    runId: responseId,
    signal: abortController.signal,
    customHandlers: handlers,
    requestBody: { messageId: responseId, conversationId },
    user: { id: senderUserId },
  });

  if (!run) {
    throw new Error('Failed to create agent run');
  }

  await run.processStream(
    { messages: formattedMessages },
    {
      runName: 'AgentRun',
      configurable: {
        thread_id: conversationId,
        user_id: senderUserId,
        user: createSafeUser(syntheticReq.user),
        ...(primaryConfig.userMCPAuthMap && { userMCPAuthMap: primaryConfig.userMCPAuthMap }),
      },
      signal: abortController.signal,
      streamMode: 'values',
      version: 'v2',
    },
    {
      callbacks: {
        [Callback.TOOL_ERROR]: (graph, error, toolId) => {
          logger.error(`[InboundEmail] Tool Error "${toolId}"`, error);
        },
      },
    },
  );

  const balanceConfig = getBalanceConfig(appConfig);
  const transactionsConfig = getTransactionsConfig(appConfig);
  recordCollectedUsage(
    { spendTokens, spendStructuredTokens },
    {
      user: senderUserId,
      conversationId,
      collectedUsage,
      context: 'inbound-email',
      balance: balanceConfig,
      transactions: transactionsConfig,
      model: primaryConfig.model || agent.model_parameters?.model,
    },
  ).catch((err) => logger.error('[InboundEmail] Error recording usage:', err));

  const responseText = aggregator.getText();
  const responseReasoning = aggregator.getReasoning();
  let highlights = formatEmailHighlights({
    text: responseText,
    reasoning: responseReasoning,
    toolCalls: aggregator.toolCalls,
  });
  if (capturedOAuthUrls.length > 0) {
    const oauthBlock = [
      '',
      '---',
      'To authenticate a required integration, open this URL in your browser:',
      ...capturedOAuthUrls,
      '---',
    ].join('\n');
    highlights = highlights ? `${highlights}\n\n${oauthBlock}` : oauthBlock;
  }

  /** Persistence block: only reached after successful run; prevents duplicates on retry */
  await db.saveMessage(
    syntheticReq,
    {
      messageId: userMessageId,
      conversationId,
      parentMessageId,
      isCreatedByUser: true,
      text: messageText,
      sender: 'User',
      endpoint: EModelEndpoint.agents,
      model: agent.id,
      files: requestFiles.map((f) => ({ file_id: f.file_id })),
    },
    { context: 'InboundEmail - user message' },
  );

  const responseMessageId = `${userMessageId}_`;
  await db.saveMessage(
    syntheticReq,
    {
      messageId: responseMessageId,
      conversationId,
      parentMessageId: userMessageId,
      isCreatedByUser: false,
      text: responseText || highlights,
      sender: agent.name || 'Assistant',
      endpoint: EModelEndpoint.agents,
      model: agent.id,
    },
    { context: 'InboundEmail - assistant response' },
  );

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

  const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
  const replyAgentToken = agent.inboundEmailToken ?? resolvedAgentToken;
  const replyTo = buildReplyToAddress(
    originalRecipient,
    replyAgentToken,
    conversationId,
  );

  if (!replyTo) {
    logger.warn('[InboundEmail] Could not build Reply-To address', {
      hasOriginalRecipient: !!originalRecipient,
      hasAgentToken: !!replyAgentToken,
      conversationId,
    });
  }

  const sendResult = await sendInboundReply({
    to: fromEmail,
    subject: replySubject,
    body: highlights || '(No response content)',
    replyTo,
  });

  if (!sendResult.success) {
    logger.error('[InboundEmail] Failed to send reply:', sendResult.error);
  }
}

module.exports = {
  processInboundEmail,
};
