const crypto = require('crypto');
const { logger } = require('@librechat/data-schemas');
const { EModelEndpoint, ResourceType, PermissionBits } = require('librechat-data-provider');
const { GenerationJobManager } = require('@librechat/api');
const { getAppConfig } = require('~/server/services/Config');
const { getAgent } = require('~/models/Agent');
const { checkPermission } = require('~/server/services/PermissionService');
const { buildOptions } = require('~/server/services/Endpoints/agents/build');
const { User } = require('~/db/models');
const { disposeClient } = require('~/server/cleanup');
const { parseTextParts } = require('librechat-data-provider');

/** Maximum prompt length for sub-agent runs (chars). Prevents model/backend stress. */
const MAX_SUB_AGENT_PROMPT_LENGTH = 32 * 1024;

/**
 * Execute a sub-agent run. Does not persist conversation or messages.
 * Returns only the final text output. Destructive tools fail immediately in sub-agent runs.
 *
 * @param {Object} params
 * @param {string} params.agentId - Agent ID to run
 * @param {string} params.prompt - Prompt to send
 * @param {string} params.userId - User ID
 * @param {string} params.subAgentStreamId - Stream ID for sub-agent progress
 * @param {string} params.parentStreamId - Parent stream ID (for sub_agent_started event)
 * @param {string} params.toolCallId - Tool call ID (for client to match widget)
 * @param {string[] | null} [params.selectedTools] - Optional: restrict tools
 * @param {AbortSignal} [params.signal] - Optional: abort signal from parent
 * @returns {Promise<{ success: boolean; output?: string; error?: string }>}
 */
async function executeSubAgent({
  agentId,
  prompt,
  userId,
  subAgentStreamId,
  parentStreamId,
  toolCallId,
  selectedTools,
  signal,
}) {
  const conversationId = crypto.randomUUID();
  const abortController = new AbortController();
  const effectiveSignal = signal ?? abortController.signal;

  try {
    const user = await User.findById(userId).lean();
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const agent = await getAgent({ id: agentId });
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    const hasAccess = await checkPermission({
      userId,
      role: user.role,
      resourceType: ResourceType.AGENT,
      resourceId: agent._id,
      requiredPermission: PermissionBits.VIEW,
    });
    if (!hasAccess) {
      throw new Error(`User ${userId} does not have permission to use agent ${agentId}`);
    }

    const resolvedPrompt =
      typeof prompt === 'string' && prompt.trim() ? prompt.trim() : null;
    if (!resolvedPrompt) {
      throw new Error('Prompt is required');
    }
    if (resolvedPrompt.length > MAX_SUB_AGENT_PROMPT_LENGTH) {
      throw new Error(
        `Prompt exceeds maximum length of ${MAX_SUB_AGENT_PROMPT_LENGTH} characters (got ${resolvedPrompt.length})`,
      );
    }

    await GenerationJobManager.createJob(subAgentStreamId, userId, conversationId);

    const appConfig = await getAppConfig({ role: user.role });

    const parsedBody = {
      endpoint: EModelEndpoint.agents,
      endpointType: EModelEndpoint.agents,
      agent_id: agentId,
    };

    const body = {
      text: resolvedPrompt,
      conversationId,
      parentMessageId: null,
      agent_id: agentId,
      endpoint: EModelEndpoint.agents,
      endpointType: EModelEndpoint.agents,
      files: [],
      isRegenerate: false,
      isContinued: false,
      editedContent: null,
      overrideParentMessageId: null,
      responseMessageId: null,
      subAgentRun: true,
      ...(Array.isArray(selectedTools) && { ephemeralAgent: { tools: selectedTools } }),
    };

    const mockReq = {
      user: { id: userId, role: user.role },
      config: appConfig,
      body,
      _resumableStreamId: subAgentStreamId,
    };

    const endpointOption = await buildOptions(
      mockReq,
      EModelEndpoint.agents,
      parsedBody,
      EModelEndpoint.agents,
    );

    if (!endpointOption?.agent) {
      throw new Error('Failed to load agent for sub-agent run');
    }

    mockReq.body.endpointOption = endpointOption;

    const noopRes = {
      write: () => true,
      end: () => {},
      setHeader: () => {},
      flushHeaders: () => {},
      headersSent: false,
      writableEnded: false,
      on: () => {},
      removeListener: () => {},
    };

    const { initializeClient } = require('~/server/services/Endpoints/agents/initialize');
    const { client } = await initializeClient({
      req: mockReq,
      res: noopRes,
      signal: effectiveSignal,
      endpointOption,
    });

    if (!client) {
      throw new Error('Failed to initialize agent client');
    }

    const messageOptions = {
      user: userId,
      onStart: () => {},
      getReqData: () => {},
      isContinued: false,
      isRegenerate: false,
      editedContent: null,
      conversationId,
      parentMessageId: null,
      abortController,
      overrideParentMessageId: null,
      isEdited: false,
      userMCPAuthMap: null,
      responseMessageId: null,
      progressOptions: { res: noopRes },
    };

    if (client?.contentParts) {
      GenerationJobManager.setContentParts(subAgentStreamId, client.contentParts);
    }

    const response = await client.sendMessage(resolvedPrompt, messageOptions);
    const databasePromise = response.databasePromise;

    if (databasePromise) {
      await databasePromise;
    }

    const contentParts = client?.getContentParts?.() ?? client?.contentParts ?? [];
    const output = parseTextParts(contentParts) || '';

    const finalEvent = {
      final: true,
      conversation: { conversationId },
      title: 'Sub-agent run',
      requestMessage: {
        messageId: null,
        conversationId,
        text: resolvedPrompt,
        isCreatedByUser: true,
      },
      responseMessage: (() => {
        const { databasePromise: _, ...msg } = response;
        return msg;
      })(),
    };
    await GenerationJobManager.emitDone(subAgentStreamId, finalEvent);
    GenerationJobManager.completeJob(subAgentStreamId);

    if (client) {
      disposeClient(client);
    }

    logger.debug(`[SubAgent] Run completed: agentId=${agentId} conv=${conversationId}`);

    return { success: true, output };
  } catch (error) {
    const errorMessage = error?.message || String(error);
    const wasAborted =
      error?.name === 'AbortError' ||
      (typeof error?.message === 'string' && error.message.includes('abort'));

    logger.error(
      `[SubAgent] Run failed: agentId=${agentId} userId=${userId} error=${errorMessage}`,
    );

    try {
      if (wasAborted) {
        await GenerationJobManager.abortJob(subAgentStreamId);
      } else {
        await GenerationJobManager.emitError(subAgentStreamId, errorMessage);
        GenerationJobManager.completeJob(subAgentStreamId, errorMessage);
      }
    } catch (streamErr) {
      logger.error(`[SubAgent] Failed to finalize stream ${subAgentStreamId}:`, streamErr);
    }

    return { success: false, error: errorMessage };
  }
}

module.exports = { executeSubAgent };
