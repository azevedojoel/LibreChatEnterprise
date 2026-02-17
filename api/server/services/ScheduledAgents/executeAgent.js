const crypto = require('crypto');
const { logger } = require('@librechat/data-schemas');
const { EModelEndpoint, ResourceType, PermissionBits } = require('librechat-data-provider');
const { GenerationJobManager } = require('@librechat/api');
const { getAppConfig } = require('~/server/services/Config');
const { initializeClient } = require('~/server/services/Endpoints/agents');
const { getAgent } = require('~/models/Agent');
const { checkPermission } = require('~/server/services/PermissionService');
const { buildOptions } = require('~/server/services/Endpoints/agents/build');
const { Conversation, ScheduledAgent, ScheduledRun, User } = require('~/db/models');
const { disposeClient } = require('~/server/cleanup');
const abortRegistry = require('./abortRegistry');

/**
 * Execute a scheduled agent run.
 * Runs the agent with the given prompt, saves messages/conversation,
 * then tags the conversation with scheduledRunId and creates or updates a ScheduledRun record.
 *
 * @param {Object} params
 * @param {string} [params.runId] - Optional: existing ScheduledRun _id (from queue). When provided, updates existing run instead of creating.
 * @param {string} params.scheduleId - ScheduledAgent _id
 * @param {string} params.userId - User ID (string)
 * @param {string} params.agentId - Agent ID
 * @param {string} params.prompt - Prompt to send
 * @param {string} [params.conversationId] - Optional: continue in same thread
 * @param {string[] | null} [params.selectedTools] - Optional: tools to use (null = all, [] = none)
 * @returns {Promise<{ success: boolean; conversationId?: string; error?: string }>}
 */
async function executeScheduledAgent({
  runId: existingRunId,
  scheduleId,
  userId,
  agentId,
  prompt,
  conversationId: existingConversationId,
  selectedTools,
}) {
  const conversationId = existingConversationId || crypto.randomUUID();
  const runAt = new Date();
  // Use conversationId as streamId so getJob(conversationId) finds it - same as normal agent runs
  const streamId = existingRunId ? conversationId : null;

  let scheduledRunDoc = null;

  try {
    if (existingRunId) {
      const updated = await ScheduledRun.findByIdAndUpdate(
        existingRunId,
        { $set: { status: 'running', runAt } },
        { new: true },
      );
      if (!updated) {
        throw new Error(`ScheduledRun not found: ${existingRunId}`);
      }
      scheduledRunDoc = updated;
    }
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

    const appConfig = await getAppConfig({ role: user.role });

    const parsedBody = {
      endpoint: EModelEndpoint.agents,
      endpointType: EModelEndpoint.agents,
      agent_id: agentId,
    };

    const body = {
      text: prompt,
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
    };
    // Headless runs (scheduled agents) always include all agent tools - do not pass
    // ephemeralAgent.tools to restrict. This ensures scheduled runs have full tool access.
    const mockReq = {
      user: { id: userId, role: user.role },
      config: appConfig,
      body,
      _resumableStreamId: streamId,
    };

    if (streamId) {
      await GenerationJobManager.createJob(streamId, userId, conversationId);
    }

    const endpointOption = await buildOptions(
      mockReq,
      EModelEndpoint.agents,
      parsedBody,
      EModelEndpoint.agents,
    );

    if (!endpointOption?.agent) {
      throw new Error('Failed to load agent for scheduled run');
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

    const abortController = new AbortController();
    if (existingRunId) {
      abortRegistry.register(existingRunId, abortController);
    }

    const { client } = await initializeClient({
      req: mockReq,
      res: noopRes,
      signal: abortController.signal,
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

    if (streamId && client?.contentParts) {
      GenerationJobManager.setContentParts(streamId, client.contentParts);
    }

    const response = await client.sendMessage(prompt, messageOptions);
    const databasePromise = response.databasePromise;

    if (!databasePromise) {
      throw new Error('No database promise from agent run');
    }

    const dbResult = await databasePromise;
    const conversation = dbResult?.conversation ?? {};

    if (existingRunId && scheduledRunDoc) {
      await ScheduledRun.findByIdAndUpdate(existingRunId, {
        $set: { status: 'success', conversationId },
      });
    } else {
      scheduledRunDoc = await ScheduledRun.create({
        scheduleId,
        userId,
        conversationId,
        runAt,
        status: 'success',
      });
    }

    const runDocId = scheduledRunDoc?._id ?? existingRunId;
    const schedule = await ScheduledAgent.findById(scheduleId).select('name').lean();
    const runTitle = `${schedule?.name ?? 'Scheduled run'} — ${runAt.toLocaleString()}`;

    await Conversation.findOneAndUpdate(
      { conversationId, user: userId },
      { $set: { scheduledRunId: runDocId, title: runTitle } },
    );

    await ScheduledAgent.findByIdAndUpdate(scheduleId, {
      $set: {
        lastRunAt: runAt,
        lastRunStatus: 'success',
        ...(existingConversationId ? {} : { conversationId }),
      },
    });

    if (client) {
      disposeClient(client);
    }

    if (streamId) {
      const runTitle =
        schedule?.name ?? 'Scheduled run';
      const finalEvent = {
        final: true,
        conversation: {
          conversationId,
          title: runTitle,
          scheduledRunId: runDocId,
        },
        title: runTitle,
        requestMessage: {
          messageId: null,
          conversationId,
          text: prompt,
          isCreatedByUser: true,
        },
        responseMessage: (() => {
          const { databasePromise: _, ...msg } = response;
          return msg;
        })(),
      };
      await GenerationJobManager.emitDone(streamId, finalEvent);
      GenerationJobManager.completeJob(streamId);
    }

    logger.info(`[ScheduledAgents] Run completed: schedule=${scheduleId} conv=${conversationId}`);

    return { success: true, conversationId };
  } catch (error) {
    const errorMessage = error?.message || String(error);
    const errorStack = error?.stack;
    const wasAborted =
      error?.name === 'AbortError' || (typeof error?.message === 'string' && error.message.includes('abort'));

    logger.error(
      `[ScheduledAgents] Run failed: scheduleId=${scheduleId} userId=${userId} agentId=${agentId} error=${errorMessage}`,
    );
    if (errorStack) {
      logger.error(`[ScheduledAgents] Run failed stack:`, errorStack);
    }

    if (streamId) {
      try {
        if (wasAborted) {
          await GenerationJobManager.abortJob(streamId);
        } else {
          await GenerationJobManager.emitError(streamId, errorMessage);
          GenerationJobManager.completeJob(streamId, errorMessage);
        }
      } catch (streamErr) {
        logger.error(`[ScheduledAgents] Failed to finalize stream ${streamId}:`, streamErr);
      }
    }

    try {
      if (existingRunId) {
        await ScheduledRun.findByIdAndUpdate(existingRunId, {
          $set: { status: 'failed', error: errorMessage },
        });
      } else {
        await ScheduledRun.create({
          scheduleId,
          userId,
          conversationId,
          runAt,
          status: 'failed',
          error: errorMessage,
        });
      }
    } catch (createErr) {
      logger.error('[ScheduledAgents] Failed to create/update ScheduledRun record:', createErr);
    }

    await ScheduledAgent.findByIdAndUpdate(scheduleId, {
      $set: {
        lastRunAt: runAt,
        lastRunStatus: 'failed',
      },
    }).catch(() => {});

    return { success: false, error: errorMessage };
  } finally {
    if (existingRunId) {
      abortRegistry.unregister(existingRunId);
    }
  }
}

module.exports = { executeScheduledAgent };
