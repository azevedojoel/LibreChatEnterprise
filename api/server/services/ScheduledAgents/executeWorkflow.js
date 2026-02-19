const crypto = require('crypto');
const { nanoid } = require('nanoid');
const { logger } = require('@librechat/data-schemas');
const { Constants, EModelEndpoint } = require('librechat-data-provider');
const { GenerationJobManager } = require('@librechat/api');
const { getAppConfig } = require('~/server/services/Config');
const { initializeClient } = require('~/server/services/Endpoints/agents');
const { getAgent } = require('~/models/Agent');
const { checkPermission } = require('~/server/services/PermissionService');
const { buildOptions } = require('~/server/services/Endpoints/agents/build');
const {
  Conversation,
  PromptGroup,
  User,
  Workflow,
  WorkflowRun,
} = require('~/db/models');
const { disposeClient } = require('~/server/cleanup');
const { resolveScheduledPrompt } = require('./resolvePrompt');
const { topologicalSort } = require('./topologicalSort');
const { saveMessage } = require('~/models');
const { ResourceType, PermissionBits } = require('librechat-data-provider');
const abortRegistry = require('./abortRegistry');

const ContentTypes = { TOOL_CALL: 'tool_call' };
const WORKFLOW_ABORT_PREFIX = 'workflow_';

/**
 * Extend resolveScheduledPrompt with {{PREV_OUTPUT}} and {{STEP_N_OUTPUT}} for workflow steps.
 * @param {string} template - Prompt template
 * @param {Object} context - Resolve context
 * @param {Object} context.stepOutputs - Map of stepIndex -> output text
 * @returns {string} Resolved prompt
 */
function resolveWorkflowPrompt(template, context) {
  let value = resolveScheduledPrompt(template, context);
  const { stepOutputs = {} } = context;
  value = value.replace(/\{\{PREV_OUTPUT\}\}/g, () => {
    const keys = Object.keys(stepOutputs).map(Number).sort((a, b) => a - b);
    const prevKey = keys.length > 0 ? keys[keys.length - 1] : null;
    return prevKey != null ? String(stepOutputs[prevKey] ?? '') : '';
  });
  value = value.replace(/\{\{STEP_(\d+)_OUTPUT\}\}/g, (_, n) => {
    const idx = parseInt(n, 10);
    return String(stepOutputs[idx] ?? '');
  });
  return value;
}

/**
 * Save synthetic handoff between workflow steps (AIMessage with tool_call + output).
 * Creates one assistant message with content containing tool_call that has output;
 * formatAgentMessages derives the ToolMessage from that.
 *
 * @param {Object} params
 * @param {string} params.conversationId - Conversation ID
 * @param {string} params.userId - User ID
 * @param {string} params.parentMessageId - Parent message ID
 * @param {string} params.fromAgentId - Source agent ID
 * @param {string} params.toAgentId - Target agent ID
 * @param {string} params.instructions - Handoff instructions (prev output + next prompt)
 * @param {object} params.req - Request-like object for saveMessage
 * @returns {Promise<string>} The created message ID
 */
async function saveSyntheticHandoff({
  conversationId,
  userId,
  parentMessageId,
  fromAgentId,
  toAgentId,
  instructions,
  req,
}) {
  const toolCallId = `handoff_${nanoid()}`;
  const toolName = `${Constants.LC_TRANSFER_TO_}${toAgentId}`;
  const handoffMessageId = crypto.randomUUID();

  const handoffContent = [
    {
      type: ContentTypes.TOOL_CALL,
      tool_call: {
        id: toolCallId,
        name: toolName,
        args: typeof instructions === 'string' ? { instructions } : { instructions: String(instructions) },
        output: typeof instructions === 'string' ? instructions : String(instructions),
        progress: 2,
      },
    },
  ];

  await saveMessage(
    req,
    {
      messageId: handoffMessageId,
      conversationId,
      parentMessageId,
      sender: 'Assistant',
      isCreatedByUser: false,
      model: fromAgentId,
      endpoint: EModelEndpoint.agents,
      content: handoffContent,
      text: '',
    },
    { context: 'executeWorkflow - synthetic handoff' },
  );

  return handoffMessageId;
}

/**
 * Execute a workflow: load workflow, topo-sort nodes, run each step in order
 * with synthetic handoffs between steps. One conversation per run.
 *
 * @param {Object} params
 * @param {string} params.workflowId - Workflow _id
 * @param {string} params.userId - User ID
 * @param {string} [params.runId] - Optional: existing WorkflowRun _id (from queue). When provided, updates existing run instead of creating.
 * @returns {Promise<{ success: boolean; conversationId?: string; run?: object; error?: string }>}
 */
async function executeWorkflow({ workflowId, userId, runId: existingRunId }) {
  const runAt = new Date();

  let workflowRunDoc = null;
  let conversationId;

  try {
    if (existingRunId) {
      const updated = await WorkflowRun.findByIdAndUpdate(
        existingRunId,
        { $set: { status: 'running', runAt } },
        { new: true },
      );
      if (!updated) {
        throw new Error(`WorkflowRun not found: ${existingRunId}`);
      }
      workflowRunDoc = updated;
      conversationId = updated.conversationId;
    } else {
      conversationId = crypto.randomUUID();
    }
    const workflow = await Workflow.findById(workflowId).lean();
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const nodes = workflow.nodes || [];
    const edges = workflow.edges || [];

    const hasInvalidNode = nodes.some((n) => !n?.promptGroupId || !n?.agentId);
    if (nodes.length === 0 || hasInvalidNode) {
      throw new Error('All workflow steps must have a prompt and agent selected');
    }

    const sortedIds = topologicalSort(nodes, edges);
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const edgeMap = new Map(edges.map((e) => [`${e.source}->${e.target}`, e]));

    if (!workflowRunDoc) {
      workflowRunDoc = await WorkflowRun.create({
        workflowId,
        userId,
        conversationId,
        runAt,
        status: 'running',
      });
    }

    const mockReq = {
      user: { id: userId, role: user.role },
      config: await getAppConfig({ role: user.role }),
      body: {},
    };

    const stepOutputs = {};
    let parentMessageId = null;
    let pendingInstructionsForNextStep = null;

    const runAbortController = new AbortController();
    if (existingRunId) {
      abortRegistry.register(`${WORKFLOW_ABORT_PREFIX}${existingRunId}`, runAbortController);
    }

    try {
    for (let i = 0; i < sortedIds.length; i++) {
      const nodeId = sortedIds[i];
      const node = nodeMap.get(nodeId);
      if (!node) continue;

      const { promptGroupId, agentId } = node;

      const agent = await getAgent({ id: agentId });
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      const agentCheck = await checkPermission({
        userId,
        role: user.role,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        requiredPermission: PermissionBits.VIEW,
      });
      if (!agentCheck) {
        throw new Error(`User does not have permission to use agent ${agentId}`);
      }

      const promptGroupCheck = await checkPermission({
        userId,
        role: user.role,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: promptGroupId,
        requiredPermission: PermissionBits.VIEW,
      });
      if (!promptGroupCheck) {
        throw new Error(`User does not have permission to use prompt group ${promptGroupId}`);
      }

      const promptGroup = await PromptGroup.findById(promptGroupId)
        .populate('productionId', 'prompt')
        .lean();
      if (!promptGroup?.productionId?.prompt) {
        throw new Error(`Prompt group ${promptGroupId} has no production prompt`);
      }

      const templatePrompt = promptGroup.productionId.prompt;
      const resolvedPrompt = resolveWorkflowPrompt(templatePrompt, {
        user,
        runAt,
        body: { conversationId, parentMessageId },
        stepOutputs,
      });

      const textToSend = pendingInstructionsForNextStep ?? resolvedPrompt;
      pendingInstructionsForNextStep = null;

      const parsedBody = {
        endpoint: EModelEndpoint.agents,
        endpointType: EModelEndpoint.agents,
        agent_id: agentId,
      };

      const body = {
        text: textToSend,
        conversationId,
        parentMessageId,
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

      if (Array.isArray(node.selectedTools)) {
        body.ephemeralAgent = { tools: node.selectedTools };
      }

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

      mockReq.body = body;

      const endpointOption = await buildOptions(
        mockReq,
        EModelEndpoint.agents,
        parsedBody,
        EModelEndpoint.agents,
      );

      if (!endpointOption?.agent) {
        throw new Error('Failed to load agent for workflow step');
      }

      mockReq.body.endpointOption = endpointOption;

      const { client } = await initializeClient({
        req: mockReq,
        res: noopRes,
        signal: runAbortController.signal,
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
        parentMessageId,
        abortController: runAbortController,
        overrideParentMessageId: null,
        isEdited: false,
        userMCPAuthMap: null,
        responseMessageId: null,
        progressOptions: { res: noopRes },
        isWorkflowTriggered: true,
      };

      const response = await client.sendMessage(textToSend, messageOptions);
      const databasePromise = response.databasePromise;

      if (!databasePromise) {
        throw new Error('No database promise from agent run');
      }

      const dbResult = await databasePromise;
      const responseMessageId = response.messageId;

      const responseText =
        typeof response.text === 'string'
          ? response.text
          : Array.isArray(response.content)
            ? response.content
                .filter((p) => p?.type === 'text' && p.text)
                .map((p) => (typeof p.text === 'string' ? p.text : p.text?.value ?? ''))
                .join('')
            : '';
      stepOutputs[i] = responseText || '(no output)';

      parentMessageId = responseMessageId;

      if (client) {
        disposeClient(client);
      }

      const nextNodeId = sortedIds[i + 1];
      if (nextNodeId) {
        const nextNode = nodeMap.get(nextNodeId);
        if (nextNode) {
          const nextPromptGroup = await PromptGroup.findById(nextNode.promptGroupId)
            .populate('productionId', 'prompt')
            .lean();
          const nextTemplate = nextPromptGroup?.productionId?.prompt ?? '';
          const nextPrompt = resolveWorkflowPrompt(nextTemplate, {
            user,
            runAt,
            body: { conversationId, parentMessageId },
            stepOutputs,
          });
          const edgeKey = `${nodeId}->${nextNodeId}`;
          const edge = edgeMap.get(edgeKey);
          const feedOutputToNext = edge?.feedOutputToNext !== false;
          const instructions = feedOutputToNext
            ? `${stepOutputs[i]}\n\n${nextPrompt}`
            : nextPrompt;
          pendingInstructionsForNextStep = instructions;

          const handoffMessageId = await saveSyntheticHandoff({
            conversationId,
            userId,
            parentMessageId: responseMessageId,
            fromAgentId: agentId,
            toAgentId: nextNode.agentId,
            instructions,
            req: mockReq,
          });

          parentMessageId = handoffMessageId;
        }
      }
    }
    } finally {
      if (existingRunId) {
        abortRegistry.unregister(`${WORKFLOW_ABORT_PREFIX}${existingRunId}`);
      }
    }

    await WorkflowRun.findByIdAndUpdate(workflowRunDoc._id, {
      $set: { status: 'success' },
    });

    const runTitle = `${workflow.name ?? 'Workflow'} — ${runAt.toLocaleString()}`;
    const lastNode = nodeMap.get(sortedIds[sortedIds.length - 1]);
    await Conversation.findOneAndUpdate(
      { conversationId, user: userId },
      {
        $set: {
          workflowRunId: workflowRunDoc._id,
          title: runTitle,
          endpoint: EModelEndpoint.agents,
          ...(lastNode?.agentId && { agent_id: lastNode.agentId }),
        },
      },
      { upsert: true },
    );

    logger.info(
      `[Workflow] Run completed: workflow=${workflowId} conv=${conversationId}`,
    );

    const run = await WorkflowRun.findById(workflowRunDoc._id).lean();
    return { success: true, conversationId, run };
  } catch (error) {
    const isAbortError =
      error?.name === 'AbortError' ||
      (typeof error?.message === 'string' && error.message.toLowerCase().includes('abort'));
    const errorMessage = isAbortError ? 'Cancelled by user' : (error?.message || String(error));
    logger.error(
      `[Workflow] Run failed: workflowId=${workflowId} userId=${userId} error=${errorMessage}`,
    );

    if (workflowRunDoc) {
      await WorkflowRun.findByIdAndUpdate(workflowRunDoc._id, {
        $set: { status: 'failed', error: errorMessage },
      }).catch(() => {});
    }

    return { success: false, error: errorMessage };
  }
}

module.exports = { executeWorkflow };
