const crypto = require('crypto');
const { logger } = require('@librechat/data-schemas');
const { EModelEndpoint } = require('librechat-data-provider');
const { getAppConfig } = require('~/server/services/Config');
const { initializeClient } = require('~/server/services/Endpoints/agents');
const { buildOptions } = require('~/server/services/Endpoints/agents/build');
const { Conversation, ScheduledAgent, ScheduledRun, User } = require('~/db/models');
const { disposeClient } = require('~/server/cleanup');

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
    if (selectedTools !== undefined && selectedTools !== null) {
      body.ephemeralAgent = { tools: selectedTools };
    }
    const mockReq = {
      user: { id: userId, role: user.role },
      config: appConfig,
      body,
      _resumableStreamId: null,
    };

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

    const response = await client.sendMessage(prompt, messageOptions);
    const databasePromise = response.databasePromise;

    if (!databasePromise) {
      throw new Error('No database promise from agent run');
    }

    await databasePromise;

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
    await Conversation.findOneAndUpdate(
      { conversationId, user: userId },
      { $set: { scheduledRunId: runDocId } },
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

    logger.info(`[ScheduledAgents] Run completed: schedule=${scheduleId} conv=${conversationId}`);

    return { success: true, conversationId };
  } catch (error) {
    const errorMessage = error?.message || String(error);
    const errorStack = error?.stack;
    logger.error(
      `[ScheduledAgents] Run failed: scheduleId=${scheduleId} userId=${userId} agentId=${agentId} error=${errorMessage}`,
    );
    if (errorStack) {
      logger.error(`[ScheduledAgents] Run failed stack:`, errorStack);
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
  }
}

module.exports = { executeScheduledAgent };
