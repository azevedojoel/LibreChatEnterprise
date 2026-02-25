const { logger } = require('@librechat/data-schemas');
const { createContentAggregator } = require('@librechat/agents');
const {
  initializeAgent,
  validateAgentModel,
  createEdgeCollector,
  filterOrphanedEdges,
  GenerationJobManager,
  getCustomEndpointConfig,
  createSequentialChainEdges,
  sendEvent,
} = require('@librechat/api');
const {
  EModelEndpoint,
  isAgentsEndpoint,
  getResponseSender,
  isEphemeralAgentId,
} = require('librechat-data-provider');
const {
  createToolEndCallback,
  getDefaultHandlers,
} = require('~/server/controllers/agents/callbacks');
const {
  loadAgentTools,
  loadToolsForExecution,
  isDestructiveTool,
} = require('~/server/services/ToolService');
const { nanoid } = require('nanoid');
const ToolConfirmationStore = require('~/server/services/ToolConfirmationStore');
const { getModelsConfig } = require('~/server/controllers/ModelController');
const AgentClient = require('~/server/controllers/agents/client');
const { getConvoFiles } = require('~/models/Conversation');
const { processAddedConvo } = require('./addedConvo');
const { getAgent } = require('~/models/Agent');
const { logViolation } = require('~/cache');
const db = require('~/models');
const { ToolApprovalLink } = require('~/db/models');

/**
 * Creates a tool loader function for the agent.
 * @param {AbortSignal} signal - The abort signal
 * @param {string | null} [streamId] - The stream ID for resumable mode
 * @param {boolean} [definitionsOnly=false] - When true, returns only serializable
 *   tool definitions without creating full tool instances (for event-driven mode)
 */
function createToolLoader(signal, streamId = null, definitionsOnly = false) {
  /**
   * @param {object} params
   * @param {ServerRequest} params.req
   * @param {ServerResponse} params.res
   * @param {string} params.agentId
   * @param {string[]} params.tools
   * @param {string} params.provider
   * @param {string} params.model
   * @param {AgentToolResources} params.tool_resources
   * @returns {Promise<{
   *   tools?: StructuredTool[],
   *   toolContextMap: Record<string, unknown>,
   *   toolDefinitions?: import('@librechat/agents').LCTool[],
   *   userMCPAuthMap?: Record<string, Record<string, string>>,
   *   toolRegistry?: import('@librechat/agents').LCToolRegistry
   * } | undefined>}
   */
  return async function loadTools({
    req,
    res,
    tools,
    model,
    agentId,
    provider,
    tool_options,
    tool_resources,
    schedulerTargetAgentIds,
  }) {
    const agent = {
      id: agentId,
      tools,
      provider,
      model,
      tool_options,
      schedulerTargetAgentIds,
    };
    try {
      return await loadAgentTools({
        req,
        res,
        agent,
        signal,
        streamId,
        tool_resources,
        definitionsOnly,
      });
    } catch (error) {
      logger.error('Error loading tools for agent ' + agentId, error);
    }
  };
}

const initializeClient = async ({ req, res, signal, endpointOption }) => {
  if (!endpointOption) {
    throw new Error('Endpoint option not provided');
  }
  const appConfig = req.config;

  /** @type {string | null} */
  const streamId = req._resumableStreamId || null;

  /** @type {Array<UsageMetadata>} */
  const collectedUsage = [];
  /** @type {ArtifactPromises} */
  const artifactPromises = [];
  const { contentParts, aggregateContent } = createContentAggregator();
  /** Tracks handed-off agent so conversation uses it for subsequent replies */
  const handoffState = { currentAgentId: null };
  const toolEndCallback = createToolEndCallback({
    req,
    res,
    artifactPromises,
    streamId,
    handoffState,
  });

  /**
   * Agent context store - populated after initialization, accessed by callback via closure.
   * Maps agentId -> { userMCPAuthMap, agent, tool_resources, toolRegistry, openAIApiKey }
   * @type {Map<string, {
   *   userMCPAuthMap?: Record<string, Record<string, string>>,
   *   agent?: object,
   *   tool_resources?: object,
   *   toolRegistry?: import('@librechat/agents').LCToolRegistry,
   *   openAIApiKey?: string
   * }>}
   */
  const agentToolContexts = new Map();

  const emitToolConfirmationEvent = (eventData) => {
    if (streamId) {
      return GenerationJobManager.emitChunk(streamId, eventData);
    }
    sendEvent(res, eventData);
  };

  const toolExecuteOptions = {
    loadTools: async (toolNames, agentId) => {
      const ctx = agentToolContexts.get(agentId) ?? {};
      logger.debug(`[ON_TOOL_EXECUTE] ctx found: ${!!ctx.userMCPAuthMap}, agent: ${ctx.agent?.id}`);
      logger.debug(`[ON_TOOL_EXECUTE] toolRegistry size: ${ctx.toolRegistry?.size ?? 'undefined'}`);

      const result = await loadToolsForExecution({
        req,
        res,
        signal,
        streamId,
        toolNames,
        agent: ctx.agent,
        toolRegistry: ctx.toolRegistry,
        userMCPAuthMap: ctx.userMCPAuthMap,
        tool_resources: ctx.tool_resources,
      });

      logger.debug(`[ON_TOOL_EXECUTE] loaded ${result.loadedTools?.length ?? 0} tools`);
      return result;
    },
    toolEndCallback,
    isDestructiveTool,
    requestToolConfirmation: async (toolCall, metadata) => {
      const conversationId = metadata?.thread_id;
      const runId = metadata?.run_id;
      const userId = metadata?.user_id;
      if (!conversationId || !runId || !userId) {
        logger.warn('[ToolConfirmation] Missing metadata for confirmation', {
          hasThreadId: !!conversationId,
          hasRunId: !!runId,
          hasUserId: !!userId,
        });
        return { approved: false };
      }
      const argsStr =
        typeof toolCall.args === 'string'
          ? toolCall.args
          : JSON.stringify(toolCall.args ?? {});
      const argsSummary = argsStr.length > 200 ? argsStr.slice(0, 200) + '...' : argsStr;

      const { promise } = await ToolConfirmationStore.register({
        conversationId,
        runId,
        toolCallId: toolCall.id,
        userId,
        toolName: toolCall.name,
        argsSummary,
      });

      emitToolConfirmationEvent({
        event: 'tool_confirmation_required',
        data: {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          args: argsSummary,
          conversationId,
          runId,
        },
      });

      if (req._headlessSendApprovalEmail) {
        const baseUrl = process.env.DOMAIN_CLIENT || process.env.DOMAIN_SERVER || 'http://localhost:3080';
        const token = nanoid(32);
        const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour TTL
        await ToolApprovalLink.create({
          token,
          conversationId,
          runId,
          toolCallId: toolCall.id,
          userId,
          toolName: toolCall.name,
          argsSummary,
          status: 'pending',
          expiresAt,
        });
        const approvalUrl = `${baseUrl}/approve/tool?id=${token}`;
        await req._headlessSendApprovalEmail({
          toolName: toolCall.name,
          argsSummary,
          approvalUrl,
        });
      }

      return promise;
    },
    captureOAuthUrl: (url, options = {}) => {
      const arr = req._headlessOAuthUrls;
      const serverName = options?.serverName;
      const servers = req._headlessOAuthServers;

      if (Array.isArray(arr)) {
        const skipDupe =
          serverName && servers?.has(serverName);
        if (skipDupe) {
          logger.info('[captureOAuthUrl] Skipping duplicate URL for server', {
            serverName,
          });
          return;
        }
        arr.push(url);
        if (serverName && servers) {
          servers.add(serverName);
        }
        logger.info('[captureOAuthUrl] OAuth URL captured', {
          urlLength: url?.length ?? 0,
          urlPreview: url ? `${url.slice(0, 80)}...` : '(empty)',
          serverName,
          arrayLengthAfter: arr.length,
        });
      } else {
        logger.warn(
          '[captureOAuthUrl] req._headlessOAuthUrls not set - URL not captured for email',
        );
      }
    },
  };

  const eventHandlers = getDefaultHandlers({
    res,
    toolExecuteOptions,
    aggregateContent,
    toolEndCallback,
    collectedUsage,
    streamId,
    handoffState,
  });

  if (!endpointOption.agent) {
    throw new Error('No agent promise provided');
  }

  const primaryAgent = await endpointOption.agent;
  delete endpointOption.agent;
  if (!primaryAgent) {
    throw new Error('Agent not found');
  }

  const modelsConfig = await getModelsConfig(req);
  const validationResult = await validateAgentModel({
    req,
    res,
    modelsConfig,
    logViolation,
    agent: primaryAgent,
  });

  if (!validationResult.isValid) {
    throw new Error(validationResult.error?.message);
  }

  const agentConfigs = new Map();
  const allowedProviders = new Set(appConfig?.endpoints?.[EModelEndpoint.agents]?.allowedProviders);

  /** Event-driven mode: only load tool definitions, not full instances */
  const loadTools = createToolLoader(signal, streamId, true);
  /** @type {Array<MongoFile>} */
  const requestFiles = req.body.files ?? [];
  /** @type {string} */
  const conversationId = req.body.conversationId;
  /** @type {string | undefined} */
  const parentMessageId = req.body.parentMessageId;

  const primaryConfig = await initializeAgent(
    {
      req,
      res,
      loadTools,
      requestFiles,
      conversationId,
      parentMessageId,
      agent: primaryAgent,
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

  logger.debug(
    `[initializeClient] Tool definitions for primary agent: ${primaryConfig.toolDefinitions?.length ?? 0}`,
  );

  /** Store primary agent's tool context for ON_TOOL_EXECUTE callback */
  logger.debug(`[initializeClient] Storing tool context for agentId: ${primaryConfig.id}`);
  logger.debug(
    `[initializeClient] toolRegistry size: ${primaryConfig.toolRegistry?.size ?? 'undefined'}`,
  );
  agentToolContexts.set(primaryConfig.id, {
    agent: primaryAgent,
    toolRegistry: primaryConfig.toolRegistry,
    userMCPAuthMap: primaryConfig.userMCPAuthMap,
    tool_resources: primaryConfig.tool_resources,
  });

  const agent_ids = primaryConfig.agent_ids;
  let userMCPAuthMap = primaryConfig.userMCPAuthMap;

  /** @type {Set<string>} Track agents that failed to load (orphaned references) */
  const skippedAgentIds = new Set();

  async function processAgent(agentId) {
    const agent = await getAgent({ id: agentId });
    if (!agent) {
      logger.warn(
        `[processAgent] Handoff agent ${agentId} not found, skipping (orphaned reference)`,
      );
      skippedAgentIds.add(agentId);
      return null;
    }

    const validationResult = await validateAgentModel({
      req,
      res,
      agent,
      modelsConfig,
      logViolation,
    });

    if (!validationResult.isValid) {
      throw new Error(validationResult.error?.message);
    }

    const config = await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        requestFiles,
        conversationId,
        parentMessageId,
        endpointOption,
        allowedProviders,
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

    if (userMCPAuthMap != null) {
      Object.assign(userMCPAuthMap, config.userMCPAuthMap ?? {});
    } else {
      userMCPAuthMap = config.userMCPAuthMap;
    }

    /** Store handoff agent's tool context for ON_TOOL_EXECUTE callback */
    agentToolContexts.set(agentId, {
      agent,
      toolRegistry: config.toolRegistry,
      userMCPAuthMap: config.userMCPAuthMap,
      tool_resources: config.tool_resources,
    });

    agentConfigs.set(agentId, config);
    return agent;
  }

  const checkAgentInit = (agentId) => agentId === primaryConfig.id || agentConfigs.has(agentId);

  // Graph topology discovery for recursive agent handoffs (BFS)
  const { edgeMap, agentsToProcess, collectEdges } = createEdgeCollector(
    checkAgentInit,
    skippedAgentIds,
  );

  // Seed with primary agent's edges
  collectEdges(primaryConfig.edges);

  // BFS to load and merge all connected agents (enables transitive handoffs: A->B->C)
  while (agentsToProcess.size > 0) {
    const agentId = agentsToProcess.values().next().value;
    agentsToProcess.delete(agentId);
    try {
      const agent = await processAgent(agentId);
      if (agent?.edges?.length) {
        collectEdges(agent.edges);
      }
    } catch (err) {
      logger.error(`[initializeClient] Error processing agent ${agentId}:`, err);
    }
  }

  /** @deprecated Agent Chain */
  if (agent_ids?.length) {
    for (const agentId of agent_ids) {
      if (checkAgentInit(agentId)) {
        continue;
      }
      await processAgent(agentId);
    }
    const chain = await createSequentialChainEdges([primaryConfig.id].concat(agent_ids), '{convo}');
    collectEdges(chain);
  }

  let edges = Array.from(edgeMap.values());

  /** Multi-Convo: Process addedConvo for parallel agent execution */
  const { userMCPAuthMap: updatedMCPAuthMap } = await processAddedConvo({
    req,
    res,
    loadTools,
    logViolation,
    modelsConfig,
    requestFiles,
    agentConfigs,
    primaryAgent,
    endpointOption,
    userMCPAuthMap,
    conversationId,
    parentMessageId,
    allowedProviders,
    primaryAgentId: primaryConfig.id,
  });

  if (updatedMCPAuthMap) {
    userMCPAuthMap = updatedMCPAuthMap;
  }

  // Ensure edges is an array when we have multiple agents (multi-agent mode)
  // MultiAgentGraph.categorizeEdges requires edges to be iterable
  if (agentConfigs.size > 0 && !edges) {
    edges = [];
  }

  // Filter out edges referencing non-existent agents (orphaned references)
  edges = filterOrphanedEdges(edges, skippedAgentIds);

  primaryConfig.edges = edges;

  let endpointConfig = appConfig.endpoints?.[primaryConfig.endpoint];
  if (!isAgentsEndpoint(primaryConfig.endpoint) && !endpointConfig) {
    try {
      endpointConfig = getCustomEndpointConfig({
        endpoint: primaryConfig.endpoint,
        appConfig,
      });
    } catch (err) {
      logger.error(
        '[api/server/controllers/agents/client.js #titleConvo] Error getting custom endpoint config',
        err,
      );
    }
  }

  const sender =
    primaryAgent.name ??
    getResponseSender({
      ...endpointOption,
      model: endpointOption.model_parameters.model,
      modelDisplayLabel: endpointConfig?.modelDisplayLabel,
      modelLabel: endpointOption.model_parameters.modelLabel,
    });

  const client = new AgentClient({
    req,
    res,
    sender,
    contentParts,
    agentConfigs,
    eventHandlers,
    collectedUsage,
    aggregateContent,
    artifactPromises,
    agent: primaryConfig,
    spec: endpointOption.spec,
    iconURL: endpointOption.iconURL,
    attachments: primaryConfig.attachments,
    endpointType: endpointOption.endpointType,
    resendFiles: primaryConfig.resendFiles ?? true,
    maxContextTokens: primaryConfig.maxContextTokens,
    endpoint: isEphemeralAgentId(primaryConfig.id) ? primaryConfig.endpoint : EModelEndpoint.agents,
    handoffState,
  });

  if (streamId) {
    GenerationJobManager.setCollectedUsage(streamId, collectedUsage);
  }

  return { client, userMCPAuthMap };
};

module.exports = { initializeClient };
