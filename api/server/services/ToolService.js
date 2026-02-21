const { logger } = require('@librechat/data-schemas');
const { tool: toolFn, DynamicStructuredTool } = require('@langchain/core/tools');
const {
  sleep,
  StepTypes,
  GraphEvents,
  createToolSearch,
  Constants: AgentConstants,
  EnvVar,
} = require('@librechat/agents');
const {
  sendEvent,
  getToolkitKey,
  hasCustomUserVars,
  getUserMCPAuthMap,
  loadToolDefinitions,
  GenerationJobManager,
  isActionDomainAllowed,
  buildWebSearchContext,
  buildToolSearchContext,
  buildImageToolContext,
  buildToolClassification,
  getToolDefinition,
  isToolSearchTool,
} = require('@librechat/api');
const {
  Time,
  Tools,
  Constants,
  CacheKeys,
  ErrorTypes,
  ContentTypes,
  imageGenTools,
  EModelEndpoint,
  EToolResources,
  actionDelimiter,
  ImageVisionTool,
  openapiToFunction,
  AgentCapabilities,
  isEphemeralAgentId,
  validateActionDomain,
  actionDomainSeparator,
  defaultAgentCapabilities,
  validateAndParseOpenAPISpec,
} = require('librechat-data-provider');
const {
  createActionTool,
  decryptMetadata,
  loadActionSets,
  domainParser,
} = require('./ActionService');
const {
  getEndpointsConfig,
  getMCPServerTools,
  getCachedTools,
} = require('~/server/services/Config');
const { processFileURL, uploadImageBuffer } = require('~/server/services/Files/process');
const { primeFiles: primeSearchFiles } = require('~/app/clients/tools/util/fileSearch');
const { manifestToolMap, toolkits } = require('~/app/clients/tools/manifest');
const { createOnSearchResults } = require('~/server/services/Tools/search');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { reinitMCPServer } = require('~/server/services/Tools/mcp');
const { createReauthToken, buildReauthLink } = require('~/server/utils/mcpReauthToken');
const { recordUsage } = require('~/server/services/Threads');
const { loadTools } = require('~/app/clients/tools/util');
const { redactMessage } = require('~/config/parsers');
const { findPluginAuthsByKeys } = require('~/models');
const { getAgents } = require('~/models/Agent');
const {
  buildSchedulerTargetContext,
  buildSchedulerPromptContext,
} = require('~/server/services/ScheduledAgents/schedulerContext');
const {
  SCHEDULER_DEFAULT_INSTRUCTIONS,
} = require('~/server/services/ScheduledAgents/schedulerInstructions');
const { getFlowStateManager } = require('~/config');
const { getLogStores } = require('~/cache');
/**
 * Processes the required actions by calling the appropriate tools and returning the outputs.
 * @param {OpenAIClient} client - OpenAI or StreamRunManager Client.
 * @param {RequiredAction} requiredActions - The current required action.
 * @returns {Promise<ToolOutput>} The outputs of the tools.
 */
const processVisionRequest = async (client, currentAction) => {
  if (!client.visionPromise) {
    return {
      tool_call_id: currentAction.toolCallId,
      output: 'No image details found.',
    };
  }

  /** @type {ChatCompletion | undefined} */
  const completion = await client.visionPromise;
  if (completion && completion.usage) {
    recordUsage({
      user: client.req.user.id,
      model: client.req.body.model,
      conversationId: (client.responseMessage ?? client.finalMessage).conversationId,
      ...completion.usage,
    });
  }
  const output = completion?.choices?.[0]?.message?.content ?? 'No image details found.';
  return {
    tool_call_id: currentAction.toolCallId,
    output,
  };
};

/**
 * Processes return required actions from run.
 * @param {OpenAIClient | StreamRunManager} client - OpenAI (legacy) or StreamRunManager Client.
 * @param {RequiredAction[]} requiredActions - The required actions to submit outputs for.
 * @returns {Promise<ToolOutputs>} The outputs of the tools.
 */
async function processRequiredActions(client, requiredActions) {
  logger.debug(
    `[required actions] user: ${client.req.user.id} | thread_id: ${requiredActions[0].thread_id} | run_id: ${requiredActions[0].run_id}`,
    requiredActions,
  );
  const appConfig = client.req.config;
  const toolDefinitions = (await getCachedTools()) ?? {};
  const seenToolkits = new Set();
  const tools = requiredActions
    .map((action) => {
      const toolName = action.tool;
      const toolDef = toolDefinitions[toolName];
      if (toolDef && !manifestToolMap[toolName]) {
        for (const toolkit of toolkits) {
          if (seenToolkits.has(toolkit.pluginKey)) {
            return;
          } else if (toolName.startsWith(`${toolkit.pluginKey}_`)) {
            seenToolkits.add(toolkit.pluginKey);
            return toolkit.pluginKey;
          }
        }
      }
      return toolName;
    })
    .filter((toolName) => !!toolName);

  const { loadedTools } = await loadTools({
    user: client.req.user.id,
    model: client.req.body.model ?? 'gpt-4o-mini',
    tools,
    functions: true,
    endpoint: client.req.body.endpoint,
    options: {
      processFileURL,
      req: client.req,
      uploadImageBuffer,
      openAIApiKey: client.apiKey,
      returnMetadata: true,
    },
    webSearch: appConfig.webSearch,
    fileStrategy: appConfig.fileStrategy,
    imageOutputType: appConfig.imageOutputType,
  });

  const ToolMap = loadedTools.reduce((map, tool) => {
    map[tool.name] = tool;
    return map;
  }, {});

  const promises = [];

  /** @type {Action[]} */
  let actionSets = [];
  let isActionTool = false;
  const ActionToolMap = {};
  const ActionBuildersMap = {};

  for (let i = 0; i < requiredActions.length; i++) {
    const currentAction = requiredActions[i];
    if (currentAction.tool === ImageVisionTool.function.name) {
      promises.push(processVisionRequest(client, currentAction));
      continue;
    }
    let tool = ToolMap[currentAction.tool] ?? ActionToolMap[currentAction.tool];

    const handleToolOutput = async (output) => {
      requiredActions[i].output = output;

      /** @type {FunctionToolCall & PartMetadata} */
      const toolCall = {
        function: {
          name: currentAction.tool,
          arguments: JSON.stringify(currentAction.toolInput),
          output,
        },
        id: currentAction.toolCallId,
        type: 'function',
        progress: 1,
        action: isActionTool,
      };

      const toolCallIndex = client.mappedOrder.get(toolCall.id);

      if (imageGenTools.has(currentAction.tool)) {
        const imageOutput = output;
        toolCall.function.output = `${currentAction.tool} displayed an image. All generated images are already plainly visible, so don't repeat the descriptions in detail. Do not list download links as they are available in the UI already. The user may download the images by clicking on them, but do not mention anything about downloading to the user.`;

        // Streams the "Finished" state of the tool call in the UI
        client.addContentData({
          [ContentTypes.TOOL_CALL]: toolCall,
          index: toolCallIndex,
          type: ContentTypes.TOOL_CALL,
        });

        await sleep(500);

        /** @type {ImageFile} */
        const imageDetails = {
          ...imageOutput,
          ...currentAction.toolInput,
        };

        const image_file = {
          [ContentTypes.IMAGE_FILE]: imageDetails,
          type: ContentTypes.IMAGE_FILE,
          // Replace the tool call output with Image file
          index: toolCallIndex,
        };

        client.addContentData(image_file);

        // Update the stored tool call
        client.seenToolCalls && client.seenToolCalls.set(toolCall.id, toolCall);

        return {
          tool_call_id: currentAction.toolCallId,
          output: toolCall.function.output,
        };
      }

      client.seenToolCalls && client.seenToolCalls.set(toolCall.id, toolCall);
      client.addContentData({
        [ContentTypes.TOOL_CALL]: toolCall,
        index: toolCallIndex,
        type: ContentTypes.TOOL_CALL,
        // TODO: to append tool properties to stream, pass metadata rest to addContentData
        // result: tool.result,
      });

      return {
        tool_call_id: currentAction.toolCallId,
        output,
      };
    };

    if (!tool) {
      // throw new Error(`Tool ${currentAction.tool} not found.`);

      // Load all action sets once if not already loaded
      if (!actionSets.length) {
        actionSets =
          (await loadActionSets({
            assistant_id: client.req.body.assistant_id,
          })) ?? [];

        // Process all action sets once
        // Map domains to their processed action sets
        const processedDomains = new Map();
        const domainMap = new Map();

        for (const action of actionSets) {
          const domain = await domainParser(action.metadata.domain, true);
          domainMap.set(domain, action);

          const isDomainAllowed = await isActionDomainAllowed(
            action.metadata.domain,
            appConfig?.actions?.allowedDomains,
          );
          if (!isDomainAllowed) {
            continue;
          }

          // Validate and parse OpenAPI spec
          const validationResult = validateAndParseOpenAPISpec(action.metadata.raw_spec);
          if (!validationResult.spec || !validationResult.serverUrl) {
            throw new Error(
              `Invalid spec: user: ${client.req.user.id} | thread_id: ${requiredActions[0].thread_id} | run_id: ${requiredActions[0].run_id}`,
            );
          }

          // SECURITY: Validate the domain from the spec matches the stored domain
          // This is defense-in-depth to prevent any stored malicious actions
          const domainValidation = validateActionDomain(
            action.metadata.domain,
            validationResult.serverUrl,
          );
          if (!domainValidation.isValid) {
            logger.error(`Domain mismatch in stored action: ${domainValidation.message}`, {
              userId: client.req.user.id,
              action_id: action.action_id,
            });
            continue; // Skip this action rather than failing the entire request
          }

          // Process the OpenAPI spec
          const { requestBuilders } = openapiToFunction(validationResult.spec);

          // Store encrypted values for OAuth flow
          const encrypted = {
            oauth_client_id: action.metadata.oauth_client_id,
            oauth_client_secret: action.metadata.oauth_client_secret,
          };

          // Decrypt metadata
          const decryptedAction = { ...action };
          decryptedAction.metadata = await decryptMetadata(action.metadata);

          processedDomains.set(domain, {
            action: decryptedAction,
            requestBuilders,
            encrypted,
          });

          // Store builders for reuse
          ActionBuildersMap[action.metadata.domain] = requestBuilders;
        }

        // Update actionSets reference to use the domain map
        actionSets = { domainMap, processedDomains };
      }

      // Find the matching domain for this tool
      let currentDomain = '';
      for (const domain of actionSets.domainMap.keys()) {
        if (currentAction.tool.includes(domain)) {
          currentDomain = domain;
          break;
        }
      }

      if (!currentDomain || !actionSets.processedDomains.has(currentDomain)) {
        // TODO: try `function` if no action set is found
        // throw new Error(`Tool ${currentAction.tool} not found.`);
        continue;
      }

      const { action, requestBuilders, encrypted } = actionSets.processedDomains.get(currentDomain);
      const functionName = currentAction.tool.replace(`${actionDelimiter}${currentDomain}`, '');
      const requestBuilder = requestBuilders[functionName];

      if (!requestBuilder) {
        // throw new Error(`Tool ${currentAction.tool} not found.`);
        continue;
      }

      // We've already decrypted the metadata, so we can pass it directly
      const _allowedDomains = appConfig?.actions?.allowedDomains;
      tool = await createActionTool({
        userId: client.req.user.id,
        res: client.res,
        action,
        requestBuilder,
        // Note: intentionally not passing zodSchema, name, and description for assistants API
        encrypted, // Pass the encrypted values for OAuth flow
        useSSRFProtection: !Array.isArray(_allowedDomains) || _allowedDomains.length === 0,
      });
      if (!tool) {
        logger.warn(
          `Invalid action: user: ${client.req.user.id} | thread_id: ${requiredActions[0].thread_id} | run_id: ${requiredActions[0].run_id} | toolName: ${currentAction.tool}`,
        );
        throw new Error(`{"type":"${ErrorTypes.INVALID_ACTION}"}`);
      }
      isActionTool = !!tool;
      ActionToolMap[currentAction.tool] = tool;
    }

    if (currentAction.tool === 'calculator') {
      currentAction.toolInput = currentAction.toolInput.input;
    }

    const handleToolError = (error) => {
      const msg = error?.message ?? '';
      const isUserCancelledAuth =
        msg.includes('User cancelled') || msg.includes('does not want to authenticate');
      const output = isUserCancelledAuth
        ? 'User cancelled authentication and does not want to proceed. Do not retry this integration.'
        : `Error processing tool ${currentAction.tool}: ${redactMessage(error.message, 256)}`;
      if (!isUserCancelledAuth) {
        logger.error(
          `tool_call_id: ${currentAction.toolCallId} | Error processing tool ${currentAction.tool}`,
          error,
        );
      } else {
        logger.info(
          `tool_call_id: ${currentAction.toolCallId} | User declined OAuth for ${currentAction.tool}`,
        );
      }
      return {
        tool_call_id: currentAction.toolCallId,
        output,
      };
    };

    try {
      const promise = tool
        ._call(currentAction.toolInput)
        .then(handleToolOutput)
        .catch(handleToolError);
      promises.push(promise);
    } catch (error) {
      const toolOutputError = handleToolError(error);
      promises.push(Promise.resolve(toolOutputError));
    }
  }

  return {
    tool_outputs: await Promise.all(promises),
  };
}

/**
 * Processes the runtime tool calls and returns the tool classes.
 * @param {Object} params - Run params containing user and request information.
 * @param {ServerRequest} params.req - The request object.
 * @param {ServerResponse} params.res - The request object.
 * @param {AbortSignal} params.signal
 * @param {Pick<Agent, 'id' | 'provider' | 'model' | 'tools'} params.agent - The agent to load tools for.
 * @param {string | undefined} [params.openAIApiKey] - The OpenAI API key.
 * @returns {Promise<{
 *   tools?: StructuredTool[];
 *   toolContextMap?: Record<string, unknown>;
 *   userMCPAuthMap?: Record<string, Record<string, string>>;
 *   toolRegistry?: Map<string, import('~/utils/toolClassification').LCTool>;
 *   hasDeferredTools?: boolean;
 * }>} The agent tools and registry.
 */
/** Native LibreChat tools that are not in the manifest */
const nativeTools = new Set([
  Tools.execute_code,
  Tools.file_search,
  Tools.web_search,
  Tools.workspace_read_file,
  Tools.workspace_edit_file,
  Tools.workspace_create_file,
  Tools.workspace_delete_file,
  Tools.workspace_list_files,
  Tools.search_user_files,
  Tools.workspace_glob_files,
  Tools.list_schedules,
  Tools.create_schedule,
  Tools.update_schedule,
  Tools.delete_schedule,
  Tools.run_schedule,
  Tools.list_runs,
  Tools.get_run,
  Tools.crm_create_contact,
  Tools.crm_update_contact,
  Tools.crm_get_contact,
  Tools.crm_list_contacts,
  Tools.crm_create_organization,
  Tools.crm_create_deal,
  Tools.crm_update_deal,
  Tools.crm_list_deals,
  Tools.crm_log_activity,
  Tools.crm_list_activities,
  Tools.crm_list_pipelines,
]);

/** Checks if a tool name is a known built-in tool */
const isBuiltInTool = (toolName) =>
  Boolean(
    manifestToolMap[toolName] ||
      toolkits.some((t) => t.pluginKey === toolName) ||
      nativeTools.has(toolName),
  );

/**
 * Loads only tool definitions without creating tool instances.
 * This is the efficient path for event-driven mode where tools are loaded on-demand.
 *
 * @param {Object} params
 * @param {ServerRequest} params.req - The request object
 * @param {ServerResponse} [params.res] - The response object for SSE events
 * @param {Object} params.agent - The agent configuration
 * @param {string|null} [params.streamId] - Stream ID for resumable mode
 * @returns {Promise<{
 *   toolDefinitions?: import('@librechat/api').LCTool[];
 *   toolRegistry?: Map<string, import('@librechat/api').LCTool>;
 *   userMCPAuthMap?: Record<string, Record<string, string>>;
 *   hasDeferredTools?: boolean;
 * }>}
 */
async function loadToolDefinitionsWrapper({ req, res, agent, streamId = null, tool_resources }) {
  if (!agent.tools || agent.tools.length === 0) {
    return { toolDefinitions: [] };
  }

  if (
    agent.tools.length === 1 &&
    (agent.tools[0] === AgentCapabilities.context || agent.tools[0] === AgentCapabilities.ocr)
  ) {
    return { toolDefinitions: [] };
  }

  const appConfig = req.config;
  const endpointsConfig = await getEndpointsConfig(req);
  let enabledCapabilities = new Set(endpointsConfig?.[EModelEndpoint.agents]?.capabilities ?? []);

  if (enabledCapabilities.size === 0) {
    enabledCapabilities = new Set(
      appConfig.endpoints?.[EModelEndpoint.agents]?.capabilities ?? defaultAgentCapabilities,
    );
  }

  const checkCapability = (capability) => enabledCapabilities.has(capability);
  const areToolsEnabled = checkCapability(AgentCapabilities.tools);
  const deferredToolsEnabled = checkCapability(AgentCapabilities.deferred_tools);

  /** Inject workspace tools when execute_code is enabled (backwards compat for agents saved before list_files/search_files existed) */
  let toolsToFilter = (agent.tools ?? []).filter((t) => t != null && typeof t === 'string');
  if (toolsToFilter.includes(Tools.execute_code)) {
    const workspaceTools = [
      Tools.workspace_read_file,
      Tools.workspace_edit_file,
      Tools.workspace_create_file,
      Tools.workspace_delete_file,
      Tools.workspace_list_files,
      Tools.search_user_files,
      Tools.workspace_glob_files,
    ];
    toolsToFilter = [...new Set([...toolsToFilter, ...workspaceTools])];
  }

  /** Inject scheduling tools when manage_scheduling is enabled (same pattern as execute_code) */
  if (toolsToFilter.includes(AgentCapabilities.manage_scheduling)) {
    const schedulingTools = [
      Tools.list_schedules,
      Tools.create_schedule,
      Tools.update_schedule,
      Tools.delete_schedule,
      Tools.run_schedule,
      Tools.list_runs,
      Tools.get_run,
    ];
    toolsToFilter = [...new Set([...toolsToFilter, ...schedulingTools])];
  }

  /** Inject CRM tools when manage_crm is enabled */
  if (toolsToFilter.includes(AgentCapabilities.manage_crm)) {
    const crmTools = [
      Tools.crm_create_contact,
      Tools.crm_update_contact,
      Tools.crm_get_contact,
      Tools.crm_list_contacts,
      Tools.crm_create_organization,
      Tools.crm_create_deal,
      Tools.crm_update_deal,
      Tools.crm_list_deals,
      Tools.crm_log_activity,
      Tools.crm_list_activities,
      Tools.crm_list_pipelines,
    ];
    toolsToFilter = [...new Set([...toolsToFilter, ...crmTools])];
  }

  /** Filter by ephemeralAgent (chat badge overrides) */
  const ephemeralAgent = req?.body?.ephemeralAgent;
  const isPersistentAgent = !isEphemeralAgentId(agent?.id);
  if (Array.isArray(ephemeralAgent?.tools)) {
    const toolsSet = new Set(ephemeralAgent.tools);
    toolsToFilter = toolsToFilter.filter((tool) => toolsSet.has(tool));
  } else if (Array.isArray(ephemeralAgent?.mcp)) {
    toolsToFilter = toolsToFilter.filter((tool) => {
      if (typeof tool !== 'string' || !tool.includes(Constants.mcp_delimiter)) {
        return true;
      }
      const serverName = tool.split(Constants.mcp_delimiter).pop();
      return ephemeralAgent.mcp.includes(serverName);
    });
  }

  const filteredTools = toolsToFilter.filter((tool) => {
    if (tool == null || typeof tool !== 'string') return false;
    if (Array.isArray(ephemeralAgent?.tools)) return true;
    if (tool === Tools.file_search) {
      if (isPersistentAgent) {
        if (ephemeralAgent?.file_search === false) return false;
        return checkCapability(AgentCapabilities.file_search);
      }
      if (ephemeralAgent != null && 'file_search' in ephemeralAgent) {
        return ephemeralAgent.file_search === true;
      }
      return checkCapability(AgentCapabilities.file_search);
    }
    if (tool === Tools.execute_code) {
      if (isPersistentAgent) {
        if (ephemeralAgent?.execute_code === false) return false;
        return checkCapability(AgentCapabilities.execute_code);
      }
      if (ephemeralAgent != null && 'execute_code' in ephemeralAgent) {
        return ephemeralAgent.execute_code === true;
      }
      return checkCapability(AgentCapabilities.execute_code);
    }
    if (tool === AgentCapabilities.manage_scheduling) {
      if (appConfig?.interfaceConfig?.scheduledAgents === false) return false;
      return checkCapability(AgentCapabilities.manage_scheduling);
    }
    if (tool === Tools.web_search) {
      if (isPersistentAgent) {
        if (ephemeralAgent?.web_search === false) return false;
        return checkCapability(AgentCapabilities.web_search);
      }
      if (ephemeralAgent != null && 'web_search' in ephemeralAgent) {
        return ephemeralAgent.web_search === true;
      }
      return checkCapability(AgentCapabilities.web_search);
    }
    if (
      tool === Tools.workspace_read_file ||
      tool === Tools.workspace_edit_file ||
      tool === Tools.workspace_create_file ||
      tool === Tools.workspace_delete_file ||
      tool === Tools.workspace_list_files ||
      tool === Tools.search_user_files ||
      tool === Tools.workspace_glob_files
    ) {
      if (isPersistentAgent) {
        if (ephemeralAgent?.execute_code === false) return false;
        return checkCapability(AgentCapabilities.execute_code);
      }
      if (ephemeralAgent != null && 'execute_code' in ephemeralAgent) {
        return ephemeralAgent.execute_code === true;
      }
      return checkCapability(AgentCapabilities.execute_code);
    }
    if (
      tool === Tools.list_schedules ||
      tool === Tools.create_schedule ||
      tool === Tools.update_schedule ||
      tool === Tools.delete_schedule ||
      tool === Tools.run_schedule ||
      tool === Tools.list_runs ||
      tool === Tools.get_run
    ) {
      if (appConfig?.interfaceConfig?.scheduledAgents === false) return false;
      return checkCapability(AgentCapabilities.manage_scheduling);
    }
    if (
      tool === Tools.crm_create_contact ||
      tool === Tools.crm_update_contact ||
      tool === Tools.crm_get_contact ||
      tool === Tools.crm_list_contacts ||
      tool === Tools.crm_create_organization ||
      tool === Tools.crm_create_deal ||
      tool === Tools.crm_update_deal ||
      tool === Tools.crm_list_deals ||
      tool === Tools.crm_log_activity ||
      tool === Tools.crm_list_activities ||
      tool === Tools.crm_list_pipelines
    ) {
      return checkCapability(AgentCapabilities.manage_crm);
    }
    if (!areToolsEnabled && !tool.includes(actionDelimiter)) {
      return false;
    }
    return true;
  });

  if (!filteredTools || filteredTools.length === 0) {
    return { toolDefinitions: [] };
  }

  /** @type {Record<string, Record<string, string>>} */
  let userMCPAuthMap;
  if (hasCustomUserVars(req.config)) {
    userMCPAuthMap = await getUserMCPAuthMap({
      tools: agent.tools,
      userId: req.user.id,
      findPluginAuthsByKeys,
    });
  }

  const flowsCache = getLogStores(CacheKeys.FLOWS);
  const flowManager = getFlowStateManager(flowsCache);
  const pendingOAuthServers = new Set();

  const createOAuthEmitter = (serverName) => {
    return async (authURL) => {
      const flowId = `${req.user.id}:${serverName}:${Date.now()}`;
      const stepId = 'step_oauth_login_' + serverName;
      const toolCall = {
        id: flowId,
        name: serverName,
        type: 'tool_call_chunk',
      };

      const runStepData = {
        runId: Constants.USE_PRELIM_RESPONSE_MESSAGE_ID,
        id: stepId,
        type: StepTypes.TOOL_CALLS,
        index: 0,
        stepDetails: {
          type: StepTypes.TOOL_CALLS,
          tool_calls: [toolCall],
        },
      };

      const runStepDeltaData = {
        id: stepId,
        delta: {
          type: StepTypes.TOOL_CALLS,
          tool_calls: [{ ...toolCall, args: '' }],
          auth: authURL,
          expires_at: Date.now() + Time.TWO_MINUTES,
        },
      };

      const runStepEvent = { event: GraphEvents.ON_RUN_STEP, data: runStepData };
      const runStepDeltaEvent = { event: GraphEvents.ON_RUN_STEP_DELTA, data: runStepDeltaData };

      if (streamId) {
        await GenerationJobManager.emitChunk(streamId, runStepEvent);
        await GenerationJobManager.emitChunk(streamId, runStepDeltaEvent);
      } else if (res && !res.writableEnded) {
        sendEvent(res, runStepEvent);
        sendEvent(res, runStepDeltaEvent);
      } else {
        logger.warn(
          `[Tool Definitions] Cannot emit OAuth event for ${serverName}: no streamId and res not available`,
        );
      }
    };
  };

  const getOrFetchMCPServerTools = async (userId, serverName) => {
    const cached = await getMCPServerTools(userId, serverName);
    if (cached) {
      return cached;
    }

    const oauthStart = async () => {
      pendingOAuthServers.add(serverName);
    };

    const result = await reinitMCPServer({
      user: req.user,
      oauthStart,
      flowManager,
      serverName,
      userMCPAuthMap,
    });

    return result?.availableTools || null;
  };

  const getActionToolDefinitions = async (agentId, actionToolNames) => {
    const actionSets = (await loadActionSets({ agent_id: agentId })) ?? [];
    if (actionSets.length === 0) {
      return [];
    }

    const definitions = [];
    const allowedDomains = appConfig?.actions?.allowedDomains;
    const domainSeparatorRegex = new RegExp(actionDomainSeparator, 'g');

    for (const action of actionSets) {
      const domain = await domainParser(action.metadata.domain, true);
      const normalizedDomain = domain.replace(domainSeparatorRegex, '_');

      const isDomainAllowed = await isActionDomainAllowed(action.metadata.domain, allowedDomains);
      if (!isDomainAllowed) {
        logger.warn(
          `[Actions] Domain "${action.metadata.domain}" not in allowedDomains. ` +
            `Add it to librechat.yaml actions.allowedDomains to enable this action.`,
        );
        continue;
      }

      const validationResult = validateAndParseOpenAPISpec(action.metadata.raw_spec);
      if (!validationResult.spec || !validationResult.serverUrl) {
        logger.warn(`[Actions] Invalid OpenAPI spec for domain: ${domain}`);
        continue;
      }

      const { functionSignatures } = openapiToFunction(validationResult.spec, true);

      for (const sig of functionSignatures) {
        const toolName = `${sig.name}${actionDelimiter}${normalizedDomain}`;
        if (!actionToolNames.some((name) => name.replace(domainSeparatorRegex, '_') === toolName)) {
          continue;
        }

        definitions.push({
          name: toolName,
          description: sig.description,
          parameters: sig.parameters,
        });
      }
    }

    return definitions;
  };

  let { toolDefinitions, toolRegistry, hasDeferredTools } = await loadToolDefinitions(
    {
      userId: req.user.id,
      agentId: agent.id,
      tools: filteredTools,
      toolOptions: agent.tool_options,
      deferredToolsEnabled,
    },
    {
      isBuiltInTool,
      loadAuthValues,
      getOrFetchMCPServerTools,
      getActionToolDefinitions,
    },
  );

  if (pendingOAuthServers.size > 0 && (res || streamId)) {
    const serverNames = Array.from(pendingOAuthServers);
    const isHeadless = Array.isArray(req._headlessOAuthUrls);
    logger.info(
      `[Tool Definitions] OAuth required for ${serverNames.length} server(s): ${serverNames.join(', ')}. ${isHeadless ? 'Headless mode: capturing link for email.' : 'Emitting events and waiting.'}`,
    );

    const oauthWaitPromises = serverNames.map(async (serverName) => {
      try {
        const oauthStart = isHeadless
          ? async () => {
              const servers = req._headlessOAuthServers;
              if (servers?.has(serverName)) {
                logger.info(`[Tool Definitions] Headless: skipping duplicate reauth link for ${serverName}`);
                return;
              }
              const reauthToken = await createReauthToken({
                userId: req.user.id,
                serverName,
              });
              const appLink = buildReauthLink(reauthToken);
              if (Array.isArray(req._headlessOAuthUrls)) {
                req._headlessOAuthUrls.push(appLink);
                if (servers) {
                  servers.add(serverName);
                }
                logger.info(`[Tool Definitions] Headless: captured reauth link for ${serverName}`);
              }
            }
          : createOAuthEmitter(serverName);

        const result = await reinitMCPServer({
          user: req.user,
          serverName,
          userMCPAuthMap,
          flowManager,
          returnOnOAuth: isHeadless,
          oauthStart,
          connectionTimeout: Time.TWO_MINUTES,
        });

        if (result?.availableTools) {
          logger.info(`[Tool Definitions] OAuth completed for ${serverName}, tools available`);
          return { serverName, success: true };
        }
        return { serverName, success: false };
      } catch (error) {
        logger.debug(`[Tool Definitions] OAuth wait failed for ${serverName}:`, error?.message);
        return { serverName, success: false };
      }
    });

    const results = await Promise.allSettled(oauthWaitPromises);
    const successfulServers = results
      .filter((r) => r.status === 'fulfilled' && r.value.success)
      .map((r) => r.value.serverName);

    if (successfulServers.length > 0) {
      logger.info(
        `[Tool Definitions] Reloading tools after OAuth for: ${successfulServers.join(', ')}`,
      );
      const reloadResult = await loadToolDefinitions(
        {
          userId: req.user.id,
          agentId: agent.id,
          tools: filteredTools,
          toolOptions: agent.tool_options,
          deferredToolsEnabled,
        },
        {
          isBuiltInTool,
          loadAuthValues,
          getOrFetchMCPServerTools,
          getActionToolDefinitions,
        },
      );
      toolDefinitions = reloadResult.toolDefinitions;
      toolRegistry = reloadResult.toolRegistry;
      hasDeferredTools = reloadResult.hasDeferredTools;
    }
  }

  /** @type {Record<string, string>} */
  const toolContextMap = {};
  const hasWebSearch = filteredTools.includes(Tools.web_search);
  const hasFileSearch = filteredTools.includes(Tools.file_search);
  const hasExecuteCode = filteredTools.includes(Tools.execute_code);
  const hasWorkspaceCodeEdit =
    filteredTools.includes(Tools.execute_code) &&
    (filteredTools.includes(Tools.workspace_read_file) ||
      filteredTools.includes(Tools.workspace_edit_file) ||
      filteredTools.includes(Tools.workspace_create_file) ||
      filteredTools.includes(Tools.workspace_delete_file) ||
      filteredTools.includes(Tools.workspace_list_files) ||
      filteredTools.includes(Tools.search_user_files) ||
      filteredTools.includes(Tools.workspace_glob_files));

  if (hasWebSearch) {
    toolContextMap[Tools.web_search] = buildWebSearchContext();
  }

  if (hasDeferredTools) {
    toolContextMap[Constants.TOOL_SEARCH] = buildToolSearchContext();
  }

  if (hasExecuteCode) {
    toolContextMap[Tools.execute_code] = '- Code execution runs locally. Supports Python only.';
  }

  if (hasWorkspaceCodeEdit) {
    toolContextMap[Tools.workspace_read_file] =
      toolContextMap[Tools.workspace_edit_file] =
      toolContextMap[Tools.workspace_create_file] =
      toolContextMap[Tools.workspace_delete_file] =
      toolContextMap[Tools.workspace_list_files] =
      toolContextMap[Tools.search_user_files] =
      toolContextMap[Tools.workspace_glob_files] =
        '- Workspace tools: operate on the conversation-scoped workspace (shared with execute_code). Files from email attachments or file_search are NOT in the workspace—use file_search for those.';
  }

  if (hasFileSearch && tool_resources) {
    try {
      const { toolContext } = await primeSearchFiles({
        req,
        tool_resources,
        agentId: agent.id,
      });
      if (toolContext) {
        toolContextMap[Tools.file_search] = toolContext;
      }
    } catch (error) {
      logger.error('[loadToolDefinitionsWrapper] Error priming search files:', error);
    }
  }

  const imageFiles = tool_resources?.[EToolResources.image_edit]?.files ?? [];
  if (imageFiles.length > 0) {
    const hasOaiImageGen = filteredTools.includes('image_gen_oai');
    const hasGeminiImageGen = filteredTools.includes('gemini_image_gen');

    if (hasOaiImageGen) {
      const toolContext = buildImageToolContext({
        imageFiles,
        toolName: `${EToolResources.image_edit}_oai`,
        contextDescription: 'image editing',
      });
      if (toolContext) {
        toolContextMap.image_edit_oai = toolContext;
      }
    }

    if (hasGeminiImageGen) {
      const toolContext = buildImageToolContext({
        imageFiles,
        toolName: 'gemini_image_gen',
        contextDescription: 'image context',
      });
      if (toolContext) {
        toolContextMap.gemini_image_gen = toolContext;
      }
    }
  }

  const hasSchedulingTools =
    filteredTools.includes(Tools.list_schedules) ||
    filteredTools.includes(Tools.create_schedule) ||
    filteredTools.includes(Tools.update_schedule) ||
    filteredTools.includes(Tools.delete_schedule) ||
    filteredTools.includes(Tools.run_schedule) ||
    filteredTools.includes(Tools.list_runs) ||
    filteredTools.includes(Tools.get_run);

  const hasCRMTools =
    filteredTools.includes(Tools.crm_list_pipelines) ||
    filteredTools.includes(Tools.crm_list_contacts) ||
    filteredTools.includes(Tools.crm_create_contact);
  if (hasCRMTools && !toolContextMap[Tools.crm_list_pipelines]) {
    let crmContext =
      "Use crm_list_pipelines to see available pipelines and stages. For 'leads with no follow-up in N days' or 'contacts who haven't been contacted', use crm_list_contacts with noActivitySinceDays (e.g. noActivitySinceDays: 3). CRM data is scoped to the agent's project.";
    const projectId = agent?.projectIds?.[0];
    if (projectId) {
      try {
        const { listPipelines } = require('~/server/services/CRM');
        const pipelines = await listPipelines(projectId.toString?.() ?? projectId);
        if (pipelines?.length > 0) {
          const pipelineList = pipelines
            .map((p) => `  - ${p.name}: stages [${(p.stages || []).join(', ')}]`)
            .join('\n');
          crmContext += `\n\n# Pipelines in this project\n${pipelineList}`;
        }
      } catch (err) {
        logger.debug('[loadToolDefinitionsWrapper] Could not load CRM pipelines for context:', err?.message);
      }
    }
    toolContextMap[Tools.crm_list_pipelines] = crmContext;
  }

  if (hasSchedulingTools) {
    const parts = [SCHEDULER_DEFAULT_INSTRUCTIONS];
    if (agent.schedulerTargetAgentIds?.length > 0) {
      try {
        const schedulerContext = await buildSchedulerTargetContext(
          agent.schedulerTargetAgentIds,
          getAgents,
        );
        if (schedulerContext) {
          parts.push(schedulerContext);
        }
      } catch (error) {
        logger.error(
          '[loadToolDefinitionsWrapper] Error building scheduler target context:',
          error,
        );
      }
    }
    try {
      const promptContext = await buildSchedulerPromptContext(
        req.user?.id,
        req.user?.role ?? 'USER',
      );
      if (promptContext) {
        parts.push(promptContext);
      }
    } catch (error) {
      logger.error('[loadToolDefinitionsWrapper] Error building scheduler prompt context:', error);
    }
    toolContextMap[Tools.create_schedule] = parts.filter(Boolean).join('\n\n');
  }

  return {
    toolRegistry,
    userMCPAuthMap,
    toolContextMap,
    toolDefinitions,
    hasDeferredTools,
  };
}

/**
 * Loads agent tools for initialization or execution.
 * @param {Object} params
 * @param {ServerRequest} params.req - The request object
 * @param {ServerResponse} params.res - The response object
 * @param {Object} params.agent - The agent configuration
 * @param {AbortSignal} [params.signal] - Abort signal
 * @param {Object} [params.tool_resources] - Tool resources
 * @param {string} [params.openAIApiKey] - OpenAI API key
 * @param {string|null} [params.streamId] - Stream ID for resumable mode
 * @param {boolean} [params.definitionsOnly=true] - When true, returns only serializable
 *   tool definitions without creating full tool instances. Use for event-driven mode
 *   where tools are loaded on-demand during execution.
 */
async function loadAgentTools({
  req,
  res,
  agent,
  signal,
  tool_resources,
  openAIApiKey,
  streamId = null,
  definitionsOnly = true,
}) {
  if (definitionsOnly) {
    return loadToolDefinitionsWrapper({ req, res, agent, streamId, tool_resources });
  }

  if (!agent.tools || agent.tools.length === 0) {
    return { toolDefinitions: [] };
  } else if (
    agent.tools &&
    agent.tools.length === 1 &&
    /** Legacy handling for `ocr` as may still exist in existing Agents */
    (agent.tools[0] === AgentCapabilities.context || agent.tools[0] === AgentCapabilities.ocr)
  ) {
    return { toolDefinitions: [] };
  }

  const appConfig = req.config;
  const endpointsConfig = await getEndpointsConfig(req);
  let enabledCapabilities = new Set(endpointsConfig?.[EModelEndpoint.agents]?.capabilities ?? []);
  /** Edge case: use defined/fallback capabilities when the "agents" endpoint is not enabled */
  if (enabledCapabilities.size === 0) {
    enabledCapabilities = new Set(
      appConfig.endpoints?.[EModelEndpoint.agents]?.capabilities ?? defaultAgentCapabilities,
    );
  }
  const checkCapability = (capability) => {
    const enabled = enabledCapabilities.has(capability);
    if (!enabled) {
      const isToolCapability = [
        AgentCapabilities.file_search,
        AgentCapabilities.execute_code,
        AgentCapabilities.web_search,
      ].includes(capability);
      const suffix = isToolCapability ? ' despite configured tool.' : '.';
      logger.warn(
        `Capability "${capability}" disabled${suffix} User: ${req.user.id} | Agent: ${agent.id}`,
      );
    }
    return enabled;
  };
  const areToolsEnabled = checkCapability(AgentCapabilities.tools);

  /** Inject workspace tools when execute_code is enabled (backwards compat for agents saved before list_files/search_files existed) */
  let toolsToFilter = (agent.tools ?? []).filter((t) => t != null && typeof t === 'string');
  if (toolsToFilter.includes(Tools.execute_code)) {
    const workspaceTools = [
      Tools.workspace_read_file,
      Tools.workspace_edit_file,
      Tools.workspace_create_file,
      Tools.workspace_delete_file,
      Tools.workspace_list_files,
      Tools.search_user_files,
      Tools.workspace_glob_files,
    ];
    toolsToFilter = [...new Set([...toolsToFilter, ...workspaceTools])];
  }

  if (toolsToFilter.includes(AgentCapabilities.manage_scheduling)) {
    const schedulingTools = [
      Tools.list_schedules,
      Tools.create_schedule,
      Tools.update_schedule,
      Tools.delete_schedule,
      Tools.run_schedule,
      Tools.list_runs,
      Tools.get_run,
    ];
    toolsToFilter = [...new Set([...toolsToFilter, ...schedulingTools])];
  }

  if (toolsToFilter.includes(AgentCapabilities.manage_crm)) {
    const crmTools = [
      Tools.crm_create_contact,
      Tools.crm_update_contact,
      Tools.crm_get_contact,
      Tools.crm_list_contacts,
      Tools.crm_create_organization,
      Tools.crm_create_deal,
      Tools.crm_update_deal,
      Tools.crm_list_deals,
      Tools.crm_log_activity,
      Tools.crm_list_activities,
      Tools.crm_list_pipelines,
    ];
    toolsToFilter = [...new Set([...toolsToFilter, ...crmTools])];
  }

  /** Filter by ephemeralAgent (chat badge overrides) */
  const ephemeralAgent = req?.body?.ephemeralAgent;
  const isPersistentAgent = !isEphemeralAgentId(agent?.id);
  if (Array.isArray(ephemeralAgent?.tools)) {
    const toolsSet = new Set(ephemeralAgent.tools);
    toolsToFilter = toolsToFilter.filter((tool) => toolsSet.has(tool));
  } else if (Array.isArray(ephemeralAgent?.mcp)) {
    toolsToFilter = toolsToFilter.filter((tool) => {
      if (typeof tool !== 'string' || !tool.includes(Constants.mcp_delimiter)) {
        return true;
      }
      const serverName = tool.split(Constants.mcp_delimiter).pop();
      return ephemeralAgent.mcp.includes(serverName);
    });
  }

  let includesWebSearch = false;
  const _agentTools = toolsToFilter.filter((tool) => {
    if (tool == null || typeof tool !== 'string') return false;
    if (Array.isArray(ephemeralAgent?.tools)) return true;
    if (tool === Tools.file_search) {
      if (isPersistentAgent) {
        if (ephemeralAgent?.file_search === false) return false;
        return checkCapability(AgentCapabilities.file_search);
      }
      if (ephemeralAgent != null && 'file_search' in ephemeralAgent) {
        return ephemeralAgent.file_search === true;
      }
      return checkCapability(AgentCapabilities.file_search);
    } else if (tool === Tools.execute_code) {
      if (isPersistentAgent) {
        if (ephemeralAgent?.execute_code === false) return false;
        return checkCapability(AgentCapabilities.execute_code);
      }
      if (ephemeralAgent != null && 'execute_code' in ephemeralAgent) {
        return ephemeralAgent.execute_code === true;
      }
      return checkCapability(AgentCapabilities.execute_code);
    } else if (tool === AgentCapabilities.manage_scheduling) {
      if (appConfig?.interfaceConfig?.scheduledAgents === false) return false;
      return checkCapability(AgentCapabilities.manage_scheduling);
    } else if (tool === Tools.web_search) {
      if (isPersistentAgent) {
        if (ephemeralAgent?.web_search === false) {
          includesWebSearch = false;
          return false;
        }
        includesWebSearch = checkCapability(AgentCapabilities.web_search);
        return includesWebSearch;
      }
      if (ephemeralAgent != null && 'web_search' in ephemeralAgent) {
        includesWebSearch = ephemeralAgent.web_search === true;
        return includesWebSearch;
      }
      includesWebSearch = checkCapability(AgentCapabilities.web_search);
      return includesWebSearch;
    } else if (
      tool === Tools.workspace_read_file ||
      tool === Tools.workspace_edit_file ||
      tool === Tools.workspace_create_file ||
      tool === Tools.workspace_delete_file ||
      tool === Tools.workspace_list_files ||
      tool === Tools.search_user_files ||
      tool === Tools.workspace_glob_files
    ) {
      if (isPersistentAgent) {
        if (ephemeralAgent?.execute_code === false) return false;
        return checkCapability(AgentCapabilities.execute_code);
      }
      if (ephemeralAgent != null && 'execute_code' in ephemeralAgent) {
        return ephemeralAgent.execute_code === true;
      }
      return checkCapability(AgentCapabilities.execute_code);
    } else if (
      tool === Tools.list_schedules ||
      tool === Tools.create_schedule ||
      tool === Tools.update_schedule ||
      tool === Tools.delete_schedule ||
      tool === Tools.run_schedule ||
      tool === Tools.list_runs ||
      tool === Tools.get_run
    ) {
      if (appConfig?.interfaceConfig?.scheduledAgents === false) return false;
      return checkCapability(AgentCapabilities.manage_scheduling);
    } else if (!areToolsEnabled && !tool.includes(actionDelimiter)) {
      return false;
    }
    return true;
  });

  if (!_agentTools || _agentTools.length === 0) {
    return {};
  }
  /** @type {ReturnType<typeof createOnSearchResults>} */
  let webSearchCallbacks;
  if (includesWebSearch) {
    webSearchCallbacks = createOnSearchResults(res, streamId);
  }

  /** @type {Record<string, Record<string, string>>} */
  let userMCPAuthMap;
  //TODO pass config from registry
  if (hasCustomUserVars(req.config)) {
    userMCPAuthMap = await getUserMCPAuthMap({
      tools: agent.tools,
      userId: req.user.id,
      findPluginAuthsByKeys,
    });
  }

  const { loadedTools, toolContextMap } = await loadTools({
    agent,
    signal,
    userMCPAuthMap,
    functions: true,
    user: req.user.id,
    tools: _agentTools,
    options: {
      req,
      res,
      openAIApiKey,
      tool_resources,
      processFileURL,
      uploadImageBuffer,
      returnMetadata: true,
      [Tools.web_search]: webSearchCallbacks,
    },
    webSearch: appConfig.webSearch,
    fileStrategy: appConfig.fileStrategy,
    imageOutputType: appConfig.imageOutputType,
  });

  /** Build tool registry from MCP tools and create PTC/tool search tools if configured */
  const deferredToolsEnabled = checkCapability(AgentCapabilities.deferred_tools);
  const { toolRegistry, toolDefinitions, additionalTools, hasDeferredTools } =
    await buildToolClassification({
      loadedTools,
      userId: req.user.id,
      agentId: agent.id,
      agentToolOptions: agent.tool_options,
      deferredToolsEnabled,
      loadAuthValues,
    });

  const agentTools = [];
  for (let i = 0; i < loadedTools.length; i++) {
    const tool = loadedTools[i];
    if (
      tool.name &&
      (tool.name === Tools.execute_code ||
        tool.name === Tools.file_search ||
        tool.name === Tools.workspace_read_file ||
        tool.name === Tools.workspace_edit_file ||
        tool.name === Tools.workspace_create_file ||
        tool.name === Tools.workspace_delete_file ||
        tool.name === Tools.workspace_list_files ||
        tool.name === Tools.search_user_files ||
        tool.name === Tools.workspace_glob_files)
    ) {
      agentTools.push(tool);
      continue;
    }

    if (!areToolsEnabled) {
      continue;
    }

    if (tool.mcp === true) {
      agentTools.push(tool);
      continue;
    }

    if (tool instanceof DynamicStructuredTool) {
      agentTools.push(tool);
      continue;
    }

    const toolDefinition = {
      name: tool.name,
      schema: tool.schema,
      description: tool.description,
    };

    if (imageGenTools.has(tool.name)) {
      toolDefinition.responseFormat = 'content_and_artifact';
    }

    const toolInstance = toolFn(async (...args) => {
      return tool['_call'](...args);
    }, toolDefinition);

    agentTools.push(toolInstance);
  }

  const ToolMap = loadedTools.reduce((map, tool) => {
    map[tool.name] = tool;
    return map;
  }, {});

  agentTools.push(...additionalTools);

  /**
   * Merge built-in tool definitions (file_search, execute_code, web_search, etc.) into
   * toolDefinitions. buildToolClassification only returns MCP + tool_search, so native
   * tools would be omitted when buildToolSet prefers toolDefinitions (e.g. inbound email).
   * This ensures the LLM receives all tools the agent has configured.
   */
  const existingDefNames = new Set((toolDefinitions ?? []).map((d) => d.name));
  let useLocalCodeExecution;
  let hasRemoteCodeKeyForExecuteCode = false;
  const disableLocalCodeExecution =
    process.env.DISABLE_LOCAL_CODE_EXECUTION === 'true' ||
    process.env.DISABLE_LOCAL_CODE_EXECUTION === '1';
  if (_agentTools.includes(Tools.execute_code)) {
    try {
      const authValues = await loadAuthValues({
        userId: req.user.id,
        authFields: [EnvVar.CODE_API_KEY],
        optional: new Set([EnvVar.CODE_API_KEY]),
        throwError: false,
      });
      const codeApiKey = authValues[EnvVar.CODE_API_KEY] ?? '';
      hasRemoteCodeKeyForExecuteCode = !!codeApiKey && codeApiKey !== 'local';
      useLocalCodeExecution = disableLocalCodeExecution
        ? false
        : !codeApiKey || codeApiKey === 'local';
    } catch {
      useLocalCodeExecution = disableLocalCodeExecution ? false : true;
    }
  }
  const mcpToolPattern = /_mcp_/;
  const builtInToolDefs = [];
  for (const toolName of _agentTools) {
    if (!toolName || typeof toolName !== 'string') continue;
    if (toolName.includes(actionDelimiter) || mcpToolPattern.test(toolName)) continue;
    if (!isBuiltInTool(toolName)) continue;
    if (existingDefNames.has(toolName)) continue;
    if (
      toolName === Tools.execute_code &&
      disableLocalCodeExecution &&
      !hasRemoteCodeKeyForExecuteCode
    ) {
      continue;
    }
    const registryDef = getToolDefinition(toolName, {
      useLocalCodeExecution: toolName === Tools.execute_code ? useLocalCodeExecution : undefined,
    });
    if (!registryDef) continue;
    builtInToolDefs.push({
      name: toolName,
      description: registryDef.description,
      parameters: registryDef.schema,
      allowed_callers: ['direct'],
    });
  }
  const mergedToolDefinitions = [...(toolDefinitions ?? []), ...builtInToolDefs];

  if (!checkCapability(AgentCapabilities.actions)) {
    return {
      toolRegistry,
      userMCPAuthMap,
      toolContextMap,
      toolDefinitions: mergedToolDefinitions,
      hasDeferredTools,
      tools: agentTools,
    };
  }

  const actionSets = (await loadActionSets({ agent_id: agent.id })) ?? [];
  if (actionSets.length === 0) {
    if (_agentTools.length > 0 && agentTools.length === 0) {
      logger.warn(`No tools found for the specified tool calls: ${_agentTools.join(', ')}`);
    }
    return {
      toolRegistry,
      userMCPAuthMap,
      toolContextMap,
      toolDefinitions: mergedToolDefinitions,
      hasDeferredTools,
      tools: agentTools,
    };
  }

  // Process each action set once (validate spec, decrypt metadata)
  const processedActionSets = new Map();
  const domainMap = new Map();

  for (const action of actionSets) {
    const domain = await domainParser(action.metadata.domain, true);
    domainMap.set(domain, action);

    // Check if domain is allowed (do this once per action set)
    const isDomainAllowed = await isActionDomainAllowed(
      action.metadata.domain,
      appConfig?.actions?.allowedDomains,
    );
    if (!isDomainAllowed) {
      continue;
    }

    // Validate and parse OpenAPI spec once per action set
    const validationResult = validateAndParseOpenAPISpec(action.metadata.raw_spec);
    if (!validationResult.spec || !validationResult.serverUrl) {
      continue;
    }

    // SECURITY: Validate the domain from the spec matches the stored domain
    // This is defense-in-depth to prevent any stored malicious actions
    const domainValidation = validateActionDomain(
      action.metadata.domain,
      validationResult.serverUrl,
    );
    if (!domainValidation.isValid) {
      logger.error(`Domain mismatch in stored action: ${domainValidation.message}`, {
        userId: req.user.id,
        agent_id: agent.id,
        action_id: action.action_id,
      });
      continue; // Skip this action rather than failing the entire request
    }

    const encrypted = {
      oauth_client_id: action.metadata.oauth_client_id,
      oauth_client_secret: action.metadata.oauth_client_secret,
    };

    // Decrypt metadata once per action set
    const decryptedAction = { ...action };
    decryptedAction.metadata = await decryptMetadata(action.metadata);

    // Process the OpenAPI spec once per action set
    const { requestBuilders, functionSignatures, zodSchemas } = openapiToFunction(
      validationResult.spec,
      true,
    );

    processedActionSets.set(domain, {
      action: decryptedAction,
      requestBuilders,
      functionSignatures,
      zodSchemas,
      encrypted,
    });
  }

  // Now map tools to the processed action sets
  const ActionToolMap = {};

  for (const toolName of _agentTools) {
    if (ToolMap[toolName]) {
      continue;
    }

    // Find the matching domain for this tool
    let currentDomain = '';
    for (const domain of domainMap.keys()) {
      if (toolName.includes(domain)) {
        currentDomain = domain;
        break;
      }
    }

    if (!currentDomain || !processedActionSets.has(currentDomain)) {
      continue;
    }

    const { action, encrypted, zodSchemas, requestBuilders, functionSignatures } =
      processedActionSets.get(currentDomain);
    const functionName = toolName.replace(`${actionDelimiter}${currentDomain}`, '');
    const functionSig = functionSignatures.find((sig) => sig.name === functionName);
    const requestBuilder = requestBuilders[functionName];
    const zodSchema = zodSchemas[functionName];

    if (requestBuilder) {
      const _allowedDomains = appConfig?.actions?.allowedDomains;
      const tool = await createActionTool({
        userId: req.user.id,
        res,
        action,
        requestBuilder,
        zodSchema,
        encrypted,
        name: toolName,
        description: functionSig.description,
        streamId,
        useSSRFProtection: !Array.isArray(_allowedDomains) || _allowedDomains.length === 0,
      });

      if (!tool) {
        logger.warn(
          `Invalid action: user: ${req.user.id} | agent_id: ${agent.id} | toolName: ${toolName}`,
        );
        throw new Error(`{"type":"${ErrorTypes.INVALID_ACTION}"}`);
      }

      agentTools.push(tool);
      ActionToolMap[toolName] = tool;
    }
  }

  if (_agentTools.length > 0 && agentTools.length === 0) {
    logger.warn(`No tools found for the specified tool calls: ${_agentTools.join(', ')}`);
    return {};
  }

  return {
    toolRegistry,
    toolContextMap,
    userMCPAuthMap,
    toolDefinitions: mergedToolDefinitions,
    hasDeferredTools,
    tools: agentTools,
  };
}

/**
 * Loads tools for event-driven execution (ON_TOOL_EXECUTE handler).
 * This function encapsulates all dependencies needed for tool loading,
 * so callers don't need to import processFileURL, uploadImageBuffer, etc.
 *
 * Handles both regular tools (MCP, built-in) and action tools.
 *
 * @param {Object} params
 * @param {ServerRequest} params.req - The request object
 * @param {ServerResponse} params.res - The response object
 * @param {AbortSignal} [params.signal] - Abort signal
 * @param {Object} params.agent - The agent object
 * @param {string[]} params.toolNames - Names of tools to load
 * @param {Record<string, Record<string, string>>} [params.userMCPAuthMap] - User MCP auth map
 * @param {Object} [params.tool_resources] - Tool resources
 * @param {string|null} [params.streamId] - Stream ID for web search callbacks
 * @returns {Promise<{ loadedTools: Array, configurable: Object }>}
 */
async function loadToolsForExecution({
  req,
  res,
  signal,
  agent,
  toolNames,
  toolRegistry,
  userMCPAuthMap,
  tool_resources,
  streamId = null,
}) {
  const appConfig = req.config;
  const allLoadedTools = [];
  const configurable = { userMCPAuthMap };

  const isToolSearchVariant = (n) =>
    isToolSearchTool(n) || (typeof n === 'string' && n.startsWith('tool_search_mcp_'));
  const toolSearchToolNames = toolNames.filter(isToolSearchVariant);
  const isToolSearch = toolSearchToolNames.length > 0;
  const isPTC = toolNames.includes(AgentConstants.PROGRAMMATIC_TOOL_CALLING);

  logger.debug(
    `[loadToolsForExecution] isToolSearch: ${isToolSearch}, toolRegistry: ${toolRegistry?.size ?? 'undefined'}`,
  );

  if (isToolSearch && toolRegistry) {
    const toolSearchTool = createToolSearch({
      mode: 'local',
      toolRegistry,
    });
    toolSearchTool.name = Constants.TOOL_SEARCH;
    allLoadedTools.push(toolSearchTool);
    configurable.toolRegistry = toolRegistry;
  }

  if (isPTC && toolRegistry) {
    configurable.toolRegistry = toolRegistry;
  }

  const specialToolNames = new Set([
    AgentConstants.PROGRAMMATIC_TOOL_CALLING,
    ...toolSearchToolNames,
  ]);

  let ptcOrchestratedToolNames = [];
  if (isPTC && toolRegistry) {
    ptcOrchestratedToolNames = Array.from(toolRegistry.keys()).filter(
      (name) => !specialToolNames.has(name),
    );
  }

  const requestedNonSpecialToolNames = toolNames.filter((name) => !specialToolNames.has(name));
  const allToolNamesToLoad = isPTC
    ? [...new Set([...requestedNonSpecialToolNames, ...ptcOrchestratedToolNames])]
    : requestedNonSpecialToolNames;

  const actionToolNames = allToolNamesToLoad.filter((name) => name.includes(actionDelimiter));
  const regularToolNames = allToolNamesToLoad.filter((name) => !name.includes(actionDelimiter));

  /** @type {Record<string, unknown>} */
  if (regularToolNames.length > 0) {
    const includesWebSearch = regularToolNames.includes(Tools.web_search);
    const webSearchCallbacks = includesWebSearch ? createOnSearchResults(res, streamId) : undefined;

    const { loadedTools } = await loadTools({
      agent,
      signal,
      userMCPAuthMap,
      functions: true,
      tools: regularToolNames,
      user: req.user.id,
      options: {
        req,
        res,
        tool_resources,
        processFileURL,
        uploadImageBuffer,
        returnMetadata: true,
        [Tools.web_search]: webSearchCallbacks,
      },
      webSearch: appConfig?.webSearch,
      fileStrategy: appConfig?.fileStrategy,
      imageOutputType: appConfig?.imageOutputType,
    });

    if (loadedTools) {
      allLoadedTools.push(...loadedTools);
    }
  }

  if (actionToolNames.length > 0 && agent) {
    const actionTools = await loadActionToolsForExecution({
      req,
      res,
      agent,
      appConfig,
      streamId,
      actionToolNames,
    });
    allLoadedTools.push(...actionTools);
  }

  if (isPTC && allLoadedTools.length > 0) {
    const ptcToolMap = new Map();
    for (const tool of allLoadedTools) {
      if (tool.name && tool.name !== AgentConstants.PROGRAMMATIC_TOOL_CALLING) {
        ptcToolMap.set(tool.name, tool);
      }
    }
    configurable.ptcToolMap = ptcToolMap;
  }

  if (
    toolNames.includes(Tools.execute_code) &&
    (res || streamId) &&
    res &&
    typeof res.write === 'function'
  ) {
    configurable.emitCodeOutputChunk = (toolCallId, chunk, source) => {
      const data = { tool_call_id: toolCallId, chunk, source };
      if (streamId) {
        GenerationJobManager.emitChunk(streamId, {
          event: 'execute_code_output',
          data,
        }).catch((err) => logger.debug('[emitCodeOutputChunk] emit failed:', err?.message));
      } else if (!res.writableEnded) {
        try {
          res.write(`event: execute_code_output\ndata: ${JSON.stringify(data)}\n\n`);
        } catch (err) {
          logger.debug('[emitCodeOutputChunk] res.write failed:', err?.message);
        }
      }
    };
  }

  return {
    configurable,
    loadedTools: allLoadedTools,
  };
}

/**
 * Loads action tools for event-driven execution.
 * @param {Object} params
 * @param {ServerRequest} params.req - The request object
 * @param {ServerResponse} params.res - The response object
 * @param {Object} params.agent - The agent object
 * @param {Object} params.appConfig - App configuration
 * @param {string|null} params.streamId - Stream ID
 * @param {string[]} params.actionToolNames - Action tool names to load
 * @returns {Promise<Array>} Loaded action tools
 */
async function loadActionToolsForExecution({
  req,
  res,
  agent,
  appConfig,
  streamId,
  actionToolNames,
}) {
  const loadedActionTools = [];

  const actionSets = (await loadActionSets({ agent_id: agent.id })) ?? [];
  if (actionSets.length === 0) {
    return loadedActionTools;
  }

  const processedActionSets = new Map();
  const domainMap = new Map();
  const allowedDomains = appConfig?.actions?.allowedDomains;

  for (const action of actionSets) {
    const domain = await domainParser(action.metadata.domain, true);
    domainMap.set(domain, action);

    const isDomainAllowed = await isActionDomainAllowed(action.metadata.domain, allowedDomains);
    if (!isDomainAllowed) {
      logger.warn(
        `[Actions] Domain "${action.metadata.domain}" not in allowedDomains. ` +
          `Add it to librechat.yaml actions.allowedDomains to enable this action.`,
      );
      continue;
    }

    const validationResult = validateAndParseOpenAPISpec(action.metadata.raw_spec);
    if (!validationResult.spec || !validationResult.serverUrl) {
      logger.warn(`[Actions] Invalid OpenAPI spec for domain: ${domain}`);
      continue;
    }

    const domainValidation = validateActionDomain(
      action.metadata.domain,
      validationResult.serverUrl,
    );
    if (!domainValidation.isValid) {
      logger.error(`Domain mismatch in stored action: ${domainValidation.message}`, {
        userId: req.user.id,
        agent_id: agent.id,
        action_id: action.action_id,
      });
      continue;
    }

    const encrypted = {
      oauth_client_id: action.metadata.oauth_client_id,
      oauth_client_secret: action.metadata.oauth_client_secret,
    };

    const decryptedAction = { ...action };
    decryptedAction.metadata = await decryptMetadata(action.metadata);

    const { requestBuilders, functionSignatures, zodSchemas } = openapiToFunction(
      validationResult.spec,
      true,
    );

    processedActionSets.set(domain, {
      action: decryptedAction,
      requestBuilders,
      functionSignatures,
      zodSchemas,
      encrypted,
    });
  }

  const domainSeparatorRegex = new RegExp(actionDomainSeparator, 'g');
  for (const toolName of actionToolNames) {
    let currentDomain = '';
    for (const domain of domainMap.keys()) {
      const normalizedDomain = domain.replace(domainSeparatorRegex, '_');
      if (toolName.includes(normalizedDomain)) {
        currentDomain = domain;
        break;
      }
    }

    if (!currentDomain || !processedActionSets.has(currentDomain)) {
      continue;
    }

    const { action, encrypted, zodSchemas, requestBuilders, functionSignatures } =
      processedActionSets.get(currentDomain);
    const normalizedDomain = currentDomain.replace(domainSeparatorRegex, '_');
    const functionName = toolName.replace(`${actionDelimiter}${normalizedDomain}`, '');
    const functionSig = functionSignatures.find((sig) => sig.name === functionName);
    const requestBuilder = requestBuilders[functionName];
    const zodSchema = zodSchemas[functionName];

    if (!requestBuilder) {
      continue;
    }

    const tool = await createActionTool({
      userId: req.user.id,
      res,
      action,
      streamId,
      zodSchema,
      encrypted,
      requestBuilder,
      name: toolName,
      description: functionSig?.description ?? '',
      useSSRFProtection: !Array.isArray(allowedDomains) || allowedDomains.length === 0,
    });

    if (!tool) {
      logger.warn(`[Actions] Failed to create action tool: ${toolName}`);
      continue;
    }

    loadedActionTools.push(tool);
  }

  return loadedActionTools;
}

module.exports = {
  loadTools,
  isBuiltInTool,
  getToolkitKey,
  loadAgentTools,
  loadToolsForExecution,
  processRequiredActions,
};
