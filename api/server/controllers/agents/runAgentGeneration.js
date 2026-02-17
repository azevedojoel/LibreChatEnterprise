/**
 * Shared agent generation logic used by ResumableAgentController and inbound email.
 * Runs the agent, saves messages, and optionally emits final events.
 */
const { logger } = require('@librechat/data-schemas');
const { Constants } = require('librechat-data-provider');
const {
  GenerationJobManager,
  decrementPendingRequest,
  sanitizeFileForTransmit,
  sanitizeMessageForTransmit,
} = require('@librechat/api');
const { disposeClient } = require('~/server/cleanup');
const { saveMessage } = require('~/models');

/**
 * Patches tool_search (and tool_search_mcp_*) parts missing output/progress before save.
 * Re-exported from request.js for use in runAgentGeneration.
 * @param {object} message - Message object with content array (mutated in place)
 */
function patchToolSearchBeforeSave(message) {
  const content = message?.content;
  if (!content || !Array.isArray(content)) {
    return;
  }
  for (const part of content) {
    if (part?.type !== 'tool_call' || !part.tool_call) {
      continue;
    }
    const tc = part.tool_call;
    const isToolSearch =
      tc.name === Constants.TOOL_SEARCH ||
      (typeof tc.name === 'string' && tc.name.startsWith('tool_search_mcp_'));
    if (!isToolSearch) {
      continue;
    }
    const hasOutput = tc.output != null && tc.output !== '';
    const hasProgress = tc.progress != null && tc.progress >= 1;
    const hasArgs =
      tc.args != null &&
      (typeof tc.args === 'string'
        ? tc.args.trim() !== ''
        : Object.keys(tc.args || {}).length > 0);
    if (!hasOutput && !hasProgress && hasArgs) {
      tc.progress = 1;
      tc.output = 'Tools discovered';
      logger.debug('[runAgentGeneration] Patched tool_search before save (missing output/progress)', {
        toolName: tc.name,
      });
    }
  }
}

/**
 * Run agent generation using the shared flow (initializeClient + sendMessage).
 * Used by both ResumableAgentController and inbound email.
 *
 * @param {Object} params
 * @param {Object} params.req - Request-like object (must have user, config, body)
 * @param {string} params.userId - User ID
 * @param {string} params.conversationId - Conversation ID
 * @param {string} params.streamId - Stream ID (same as conversationId for resumable)
 * @param {Object} params.endpointOption - Endpoint options from buildOptions
 * @param {Object} params.job - GenerationJobManager job (with abortController, readyPromise)
 * @param {number} [params.jobCreatedAt] - Job creation timestamp (for replacement check in web flow)
 * @param {Object} params.result - Result from initializeClient { client, userMCPAuthMap }
 * @param {Object} [params.options] - Generation options
 * @param {string} [params.options.text] - User message text
 * @param {boolean} [params.options.isContinued]
 * @param {boolean} [params.options.isRegenerate]
 * @param {string|null} [params.options.editedContent]
 * @param {string|null} [params.options.parentMessageId]
 * @param {string|null} [params.options.overrideParentMessageId]
 * @param {string|null} [params.options.editedResponseMessageId]
 * @param {string|null} [params.options.reqConversationId] - Original request conversationId (for isNewConvo)
 * @param {Function} [params.options.addTitle] - Title generator (web flow only)
 * @param {boolean} [params.options.isHeadless] - When true: skip pending request decrement, no addTitle, support OAuth capture
 * @param {string[]} [params.options.capturedOAuthUrls] - Array to capture OAuth URLs (headless only)
 * @returns {Promise<{ response: Object, userMessage: Object, conversation: Object }>}
 */
async function runAgentGeneration({
  req,
  userId,
  conversationId,
  streamId,
  endpointOption,
  job,
  result,
  options = {},
}) {
  const {
    text,
    isContinued = false,
    isRegenerate = false,
    editedContent = null,
    parentMessageId = null,
    overrideParentMessageId = null,
    editedResponseMessageId = null,
    reqConversationId = null,
    addTitle = null,
    isHeadless = false,
    capturedOAuthUrls = null,
    jobCreatedAt = null,
  } = options;

  const client = result.client;
  let userMessage;

  const getReqData = (data = {}) => {
    if (data.userMessage) {
      userMessage = data.userMessage;
    }
  };

  if (isHeadless && Array.isArray(capturedOAuthUrls)) {
    req._headlessOAuthUrls = capturedOAuthUrls;
  }

  try {
    if (!isHeadless) {
      await Promise.race([
        job.readyPromise,
        new Promise((resolve) => setTimeout(resolve, 100)),
      ]);
    } else {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } catch (waitError) {
    logger.warn(
      `[runAgentGeneration] Error waiting for subscriber: ${waitError?.message ?? waitError}`,
    );
  }

  const onStart = (userMsg, respMsgId, _isNewConvo) => {
    userMessage = userMsg;
    if (!isHeadless) {
      GenerationJobManager.updateMetadata(streamId, {
        responseMessageId: respMsgId,
        userMessage: {
          messageId: userMsg.messageId,
          parentMessageId: userMsg.parentMessageId,
          conversationId: userMsg.conversationId,
          text: userMsg.text,
        },
      });
      GenerationJobManager.emitChunk(streamId, {
        created: true,
        message: userMessage,
        streamId,
      });
    }
  };

  const messageOptions = {
    user: userId,
    onStart,
    getReqData,
    isContinued,
    isRegenerate,
    editedContent,
    conversationId,
    parentMessageId,
    abortController: job.abortController,
    overrideParentMessageId,
    isEdited: !!editedContent,
    userMCPAuthMap: result.userMCPAuthMap,
    responseMessageId: editedResponseMessageId,
    progressOptions: {
      res: {
        write: () => true,
        end: () => {},
        headersSent: false,
        writableEnded: false,
      },
    },
  };

  const response = await client.sendMessage(text, messageOptions);

  const messageId = response.messageId;
  const endpoint = endpointOption.endpoint;
  response.endpoint = endpoint;

  const databasePromise = response.databasePromise;
  delete response.databasePromise;

  const { conversation: convoData = {} } = await databasePromise;
  const conversation = { ...convoData };
  conversation.title =
    conversation && !conversation.title ? null : conversation?.title || 'New Chat';

  if (req.body?.files && client.options?.attachments) {
    userMessage.files = [];
    const messageFiles = new Set(req.body.files.map((file) => file.file_id));
    for (const attachment of client.options.attachments) {
      if (messageFiles.has(attachment.file_id)) {
        userMessage.files.push(sanitizeFileForTransmit(attachment));
      }
    }
    delete userMessage.image_urls;
  }

  const wasAbortedBeforeComplete = job.abortController.signal.aborted;

  if (!client.skipSaveUserMessage && userMessage) {
    await saveMessage(req, userMessage, {
      context: 'runAgentGeneration - user message',
    });
  }

  if (client.savedMessageIds && !client.savedMessageIds.has(messageId)) {
    const toSave = { ...response, user: userId, unfinished: wasAbortedBeforeComplete };
    patchToolSearchBeforeSave(toSave);
    await saveMessage(req, toSave, {
      context: 'runAgentGeneration - response',
    });
  }

  if (!isHeadless) {
    const currentJob = await GenerationJobManager.getJob(streamId);
    const jobWasReplaced =
      jobCreatedAt != null &&
      currentJob &&
      currentJob.createdAt !== jobCreatedAt;

    if (jobWasReplaced) {
      logger.debug(`[runAgentGeneration] Skipping FINAL emit - job was replaced`);
      await decrementPendingRequest(userId);
      if (client) {
        disposeClient(client);
      }
      return { response, userMessage, conversation };
    }

    const isNewConvo = !reqConversationId || reqConversationId === 'new';
    const shouldGenerateTitle =
      addTitle &&
      parentMessageId === Constants.NO_PARENT &&
      isNewConvo &&
      !wasAbortedBeforeComplete;

    await GenerationJobManager.emitDone(streamId, {
      final: true,
      conversation,
      title: conversation.title,
      requestMessage: sanitizeMessageForTransmit(userMessage),
      responseMessage: wasAbortedBeforeComplete
        ? { ...response, unfinished: true }
        : { ...response },
    });
    GenerationJobManager.completeJob(
      streamId,
      wasAbortedBeforeComplete ? 'Request aborted' : undefined,
    );
    await decrementPendingRequest(userId);

    if (shouldGenerateTitle) {
      addTitle(req, {
        text,
        response: { ...response },
        client,
      }).catch((err) => {
        logger.error('[runAgentGeneration] Error in title generation', err);
      });
    }
  } else {
    GenerationJobManager.completeJob(streamId);
  }

  if (client) {
    disposeClient(client);
  }

  return { response, userMessage, conversation };
}

module.exports = {
  runAgentGeneration,
  patchToolSearchBeforeSave,
};
