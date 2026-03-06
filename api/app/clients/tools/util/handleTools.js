const { logger } = require('@librechat/data-schemas');
const {
  EnvVar,
  Calculator,
  createSearchTool,
  createCodeExecutionTool,
} = require('@librechat/agents');
const {
  checkAccess,
  createSafeUser,
  mcpToolPattern,
  loadWebSearchAuth,
  buildImageToolContext,
  buildWebSearchContext,
} = require('@librechat/api');
const { getMCPServersRegistry } = require('~/config');
const {
  Tools,
  Constants,
  Permissions,
  EToolResources,
  PermissionTypes,
} = require('librechat-data-provider');
const {
  availableTools,
  manifestToolMap,
  // Basic Tools
  GoogleSearchAPI,
  // Structured Tools
  DALLE3,
  FluxAPI,
  OpenWeather,
  StructuredSD,
  StructuredACS,
  TraversaalSearch,
  StructuredWolfram,
  TavilySearchResults,
  createGeminiImageTool,
  createOpenAIImageTools,
  PostmarkSendUserEmail,
} = require('../');
const { primeFiles: primeCodeFiles } = require('~/server/services/Files/Code/process');
const { createLocalCodeExecutionTool } = require('~/server/services/LocalCodeExecution');
const {
  createWorkspaceCodeEditTools,
  createPullFileToWorkspaceTool,
  createListMyFilesTool,
} = require('~/server/services/WorkspaceCodeEdit');
const { createCreatePdfTool } = require('~/server/services/CreatePdf/tool');
const { createRunToolAndSaveTool } = require('~/server/services/RunToolAndSave/tool');
const { createBrainstormDocTool } = require('~/server/services/BrainstormDoc/tool');
const { createGenerateCodeTool } = require('~/server/services/GenerateCode');
const {
  createWorkspaceStatusTool,
  createWorkspaceInitTool,
  createResetWorkspaceTool,
} = require('~/server/services/WorkspaceStatus');
const {
  createCreatePlanTool,
  createUpdateTodoTool,
} = require('~/server/services/CoderPlan');
const { createInstallDependenciesTool } = require('~/server/services/InstallDependencies');
const { createLintTool } = require('~/server/services/Lint');
const { createRunProgramTool } = require('~/server/services/RunProgram');
const { createSchedulingTools } = require('~/server/services/ScheduledAgents/schedulingTools');
const {
  buildSchedulerTargetContext,
  buildSchedulerPromptContext,
} = require('~/server/services/ScheduledAgents/schedulerContext');
const {
  SCHEDULER_DEFAULT_INSTRUCTIONS,
} = require('~/server/services/ScheduledAgents/schedulerInstructions');
const { getAgents } = require('~/models/Agent');
const { createFileSearchTool, primeFiles: primeSearchFiles } = require('./fileSearch');
const { getUserPluginAuthValue } = require('~/server/services/PluginService');
const { createMCPTool, createMCPTools } = require('~/server/services/MCP');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { getMCPServerTools } = require('~/server/services/Config');
const { getRoleByName } = require('~/models/Role');
const { findUser } = require('~/models');
const { getConvo } = require('~/models/Conversation');
const { createCRMTools } = require('../structured/CRMTools');
const { createProjectTools, createProjectManagementTools } = require('../structured/ProjectTools');
const { createHumanTools } = require('~/server/services/HumanAgent');

const PROJECT_MANAGEMENT_TOOL_NAMES = new Set([
  Tools.project_create,
  Tools.project_list,
  Tools.project_archive,
  Tools.project_update_metadata,
  Tools.project_switch,
]);

/**
 * Validates the availability and authentication of tools for a user based on environment variables or user-specific plugin authentication values.
 * Tools without required authentication or with valid authentication are considered valid.
 *
 * @param {Object} user The user object for whom to validate tool access.
 * @param {Array<string>} tools An array of tool identifiers to validate. Defaults to an empty array.
 * @returns {Promise<Array<string>>} A promise that resolves to an array of valid tool identifiers.
 */
const validateTools = async (user, tools = []) => {
  try {
    const validToolsSet = new Set(tools);
    const availableToolsToValidate = availableTools.filter((tool) =>
      validToolsSet.has(tool.pluginKey),
    );

    /**
     * Validates the credentials for a given auth field or set of alternate auth fields for a tool.
     * If valid admin or user authentication is found, the function returns early. Otherwise, it removes the tool from the set of valid tools.
     *
     * @param {string} authField The authentication field or fields (separated by "||" for alternates) to validate.
     * @param {string} toolName The identifier of the tool being validated.
     */
    const validateCredentials = async (authField, toolName) => {
      const fields = authField.split('||');
      for (const field of fields) {
        const adminAuth = process.env[field];
        if (adminAuth && adminAuth.length > 0) {
          return;
        }

        let userAuth = null;
        try {
          userAuth = await getUserPluginAuthValue(user, field);
        } catch (err) {
          if (field === fields[fields.length - 1] && !userAuth) {
            throw err;
          }
        }
        if (userAuth && userAuth.length > 0) {
          return;
        }
      }

      validToolsSet.delete(toolName);
    };

    for (const tool of availableToolsToValidate) {
      if (!tool.authConfig || tool.authConfig.length === 0) {
        continue;
      }

      for (const auth of tool.authConfig) {
        await validateCredentials(auth.authField, tool.pluginKey);
      }
    }

    return Array.from(validToolsSet.values());
  } catch (err) {
    logger.error('[validateTools] There was a problem validating tools', err);
    throw new Error(err);
  }
};

/** @typedef {typeof import('@langchain/core/tools').Tool} ToolConstructor */
/** @typedef {import('@langchain/core/tools').Tool} Tool */

/**
 * Initializes a tool with authentication values for the given user, supporting alternate authentication fields.
 * Authentication fields can have alternates separated by "||", and the first defined variable will be used.
 *
 * @param {string} userId The user ID for which the tool is being loaded.
 * @param {Array<string>} authFields Array of strings representing the authentication fields. Supports alternate fields delimited by "||".
 * @param {ToolConstructor} ToolConstructor The constructor function for the tool to be initialized.
 * @param {Object} options Optional parameters to be passed to the tool constructor alongside authentication values.
 * @returns {() => Promise<Tool>} An Async function that, when called, asynchronously initializes and returns an instance of the tool with authentication.
 */
const loadToolWithAuth = (userId, authFields, ToolConstructor, options = {}) => {
  return async function () {
    const authValues = await loadAuthValues({ userId, authFields });
    return new ToolConstructor({ ...options, ...authValues, userId });
  };
};

/**
 * @param {string} toolKey
 * @returns {Array<string>}
 */
const getAuthFields = (toolKey) => {
  return manifestToolMap[toolKey]?.authConfig.map((auth) => auth.authField) ?? [];
};

/**
 *
 * @param {object} params
 * @param {string} params.user
 * @param {Record<string, Record<string, string>>} [object.userMCPAuthMap]
 * @param {AbortSignal} [object.signal]
 * @param {Pick<Agent, 'id' | 'provider' | 'model'>} [params.agent]
 * @param {string} [params.model]
 * @param {EModelEndpoint} [params.endpoint]
 * @param {LoadToolOptions} [params.options]
 * @param {boolean} [params.useSpecs]
 * @param {Array<string>} params.tools
 * @param {boolean} [params.functions]
 * @param {boolean} [params.returnMap]
 * @param {AppConfig['webSearch']} [params.webSearch]
 * @param {AppConfig['fileStrategy']} [params.fileStrategy]
 * @param {AppConfig['imageOutputType']} [params.imageOutputType]
 * @returns {Promise<{ loadedTools: Tool[], toolContextMap: Object<string, any> } | Record<string,Tool>>}
 */
const loadTools = async ({
  user,
  agent,
  model,
  signal,
  endpoint,
  userMCPAuthMap,
  tools = [],
  options = {},
  functions = true,
  returnMap = false,
  webSearch,
  fileStrategy,
  imageOutputType,
}) => {
  tools = [...new Set(tools.filter((t) => t != null && typeof t === 'string'))];

  const CRM_TOOL_NAMES = new Set(
    Object.values(Tools).filter((t) => typeof t === 'string' && t.startsWith('crm_')),
  );
  const PROJECT_TOOL_NAMES = new Set(
    Object.values(Tools).filter((t) => typeof t === 'string' && t.startsWith('project_')),
  );
  const HUMAN_TOOL_NAMES = new Set(
    Object.values(Tools).filter((t) => typeof t === 'string' && t.startsWith('human_')),
  );
  const hasCRMTools = tools.some((t) => CRM_TOOL_NAMES.has(t));
  const hasProjectTools = tools.some((t) => PROJECT_TOOL_NAMES.has(t));
  let userProjectId = null;
  if (hasCRMTools) {
    try {
      const userDoc = await findUser({ _id: user }, 'projectId');
      userProjectId = userDoc?.projectId?.toString?.() ?? userDoc?.projectId ?? null;
    } catch (err) {
      logger.debug('[handleTools] Could not resolve projectId for CRM tools:', err);
    }
  }
  let userWorkspaceId = null;
  if (HUMAN_TOOL_NAMES.size > 0 && tools.some((t) => HUMAN_TOOL_NAMES.has(t))) {
    try {
      const userDoc = await findUser({ _id: user }, 'workspace_id');
      userWorkspaceId = userDoc?.workspace_id?.toString?.() ?? userDoc?.workspace_id ?? null;
    } catch (err) {
      logger.debug('[handleTools] Could not resolve workspace_id for Human tools:', err);
    }
  }
  let conversationUserProjectId = null;
  if (hasProjectTools) {
    try {
      const conversationId = options.req?.body?.conversationId;
      logger.debug(
        `[handleTools] Project tools requested | conversationId=${conversationId} | req.body.userProjectId=${options.req?.body?.userProjectId ?? 'undefined'}`,
      );
      if (conversationId && conversationId !== 'new') {
        const convo = await getConvo(user, conversationId);
        conversationUserProjectId =
          convo?.userProjectId?.toString?.() ?? convo?.userProjectId ?? null;
        logger.debug(
          `[handleTools] getConvo result | convo.userProjectId=${convo?.userProjectId ?? 'undefined'} | resolved=${conversationUserProjectId ?? 'null'}`,
        );
      }
    } catch (err) {
      logger.debug('[handleTools] Could not resolve userProjectId for project tools:', err);
    }
    conversationUserProjectId =
      conversationUserProjectId ?? options.req?.body?.userProjectId ?? null;
    if (!conversationUserProjectId) {
      logger.debug(
        `[handleTools] No userProjectId at run start - project context tools will resolve at call time (e.g. after project_switch)`,
      );
    } else {
      logger.debug(
        `[handleTools] Creating project tools with conversationUserProjectId=${conversationUserProjectId}`,
      );
    }
  }

  const toolConstructors = {
    flux: FluxAPI,
    calculator: Calculator,
    google: GoogleSearchAPI,
    open_weather: OpenWeather,
    wolfram: StructuredWolfram,
    'stable-diffusion': StructuredSD,
    'azure-ai-search': StructuredACS,
    traversaal_search: TraversaalSearch,
    tavily_search_results_json: TavilySearchResults,
    send_user_email: PostmarkSendUserEmail,
  };

  const customConstructors = {
    image_gen_oai: async (toolContextMap) => {
      const authFields = getAuthFields('image_gen_oai');
      const authValues = await loadAuthValues({ userId: user, authFields });
      const imageFiles = options.tool_resources?.[EToolResources.image_edit]?.files ?? [];
      const toolContext = buildImageToolContext({
        imageFiles,
        toolName: `${EToolResources.image_edit}_oai`,
        contextDescription: 'image editing',
      });
      if (toolContext) {
        toolContextMap.image_edit_oai = toolContext;
      }
      return createOpenAIImageTools({
        ...authValues,
        isAgent: !!agent,
        req: options.req,
        imageOutputType,
        fileStrategy,
        imageFiles,
      });
    },
    gemini_image_gen: async (toolContextMap) => {
      const authFields = getAuthFields('gemini_image_gen');
      const authValues = await loadAuthValues({ userId: user, authFields });
      const imageFiles = options.tool_resources?.[EToolResources.image_edit]?.files ?? [];
      const toolContext = buildImageToolContext({
        imageFiles,
        toolName: 'gemini_image_gen',
        contextDescription: 'image context',
      });
      if (toolContext) {
        toolContextMap.gemini_image_gen = toolContext;
      }
      return createGeminiImageTool({
        ...authValues,
        isAgent: !!agent,
        req: options.req,
        imageFiles,
        processFileURL: options.processFileURL,
        userId: user,
        fileStrategy,
      });
    },
  };

  const requestedTools = {};

  if (functions === true) {
    toolConstructors.dalle = DALLE3;
  }

  /** @type {ImageGenOptions} */
  const imageGenOptions = {
    isAgent: !!agent,
    req: options.req,
    fileStrategy,
    processFileURL: options.processFileURL,
    returnMetadata: options.returnMetadata,
    uploadImageBuffer: options.uploadImageBuffer,
  };

  const toolOptions = {
    flux: imageGenOptions,
    dalle: imageGenOptions,
    'stable-diffusion': imageGenOptions,
    gemini_image_gen: imageGenOptions,
    send_user_email: {
      agentName: agent?.name ?? null,
      scheduleName: options.req?.body?.scheduledRunContext?.scheduleName ?? null,
    },
  };

  /** @type {Record<string, string>} */
  const toolContextMap = {};
  const requestedMCPTools = {};

  for (const tool of tools) {
    if (tool === Tools.execute_code) {
      const disableLocal =
        process.env.DISABLE_LOCAL_CODE_EXECUTION === 'true' ||
        process.env.DISABLE_LOCAL_CODE_EXECUTION === '1';
      requestedTools[tool] = async () => {
        const authValues = await loadAuthValues({
          userId: user,
          authFields: [EnvVar.CODE_API_KEY],
          optional: new Set([EnvVar.CODE_API_KEY]),
          throwError: false,
        });
        const codeApiKey = authValues[EnvVar.CODE_API_KEY] ?? '';
        const useLocalExecution = !disableLocal && (!codeApiKey || codeApiKey === 'local');
        if (disableLocal && (!codeApiKey || codeApiKey === 'local')) {
          throw new Error(
            'Local code execution is disabled. Configure a remote code execution API key (E2B/Replit) or set DISABLE_LOCAL_CODE_EXECUTION=false.',
          );
        }
        const { files, toolContext } = await primeCodeFiles(
          {
            ...options,
            agentId: agent?.id,
          },
          codeApiKey,
        );
        if (toolContext) {
          toolContextMap[tool] = toolContext;
        }
        const CodeExecutionTool = useLocalExecution
          ? createLocalCodeExecutionTool({
              agentId: agent?.id,
              user_id: user,
              files,
              req: options.req,
            })
          : createCodeExecutionTool({
              user_id: user,
              files,
              ...authValues,
              apiKey: codeApiKey,
            });
        return CodeExecutionTool;
      };
      continue;
    } else if (
      tool === Tools.workspace_read_file ||
      tool === Tools.workspace_edit_file ||
      tool === Tools.workspace_create_file ||
      tool === Tools.workspace_delete_file ||
      tool === Tools.workspace_list_files ||
      tool === Tools.search_user_files ||
      tool === Tools.workspace_glob_files ||
      tool === Tools.workspace_send_file_to_user ||
      tool === Tools.workspace_pull_file ||
      tool === Tools.list_my_files
    ) {
      const conversationId = options.req?.body?.conversationId ?? options.conversationId;
      const agentId = agent?.id;
      const userId = user;
      if (!conversationId && !(agentId && userId)) {
        continue;
      }
      const pathMod = require('path');
      const {
        getSessionBaseDir,
        injectAgentFiles,
        getWorkspaceSessionId,
      } = require('~/server/services/LocalCodeExecution');
      const sessionId = getWorkspaceSessionId({
        agentId,
        userId,
        conversationId,
      });
      const workspaceRoot = pathMod.join(getSessionBaseDir(), sessionId);

      let workspaceInjected = false;
      const ensureWorkspaceInjected = async () => {
        if (workspaceInjected) return;
        const { files } = await primeCodeFiles({ ...options, agentId: agent?.id }, '');
        await injectAgentFiles(workspaceRoot, files, options.req);
        workspaceInjected = true;
      };

      const [
        readFileTool,
        editFileTool,
        createFileTool,
        deleteFileTool,
        listFilesTool,
        globFilesTool,
        searchFilesTool,
        sendFileToUserTool,
      ] = createWorkspaceCodeEditTools({ workspaceRoot });
      const pullFileToWorkspaceTool = createPullFileToWorkspaceTool({
        workspaceRoot,
        req: options.req,
        agentId,
        userId,
      });
      const listMyFilesTool = createListMyFilesTool({
        req: options.req,
        agentId,
        userId,
      });
      const toolMap = {
        [Tools.workspace_read_file]: readFileTool,
        [Tools.workspace_edit_file]: editFileTool,
        [Tools.workspace_create_file]: createFileTool,
        [Tools.workspace_delete_file]: deleteFileTool,
        [Tools.workspace_list_files]: listFilesTool,
        [Tools.search_user_files]: searchFilesTool,
        [Tools.workspace_glob_files]: globFilesTool,
        [Tools.workspace_send_file_to_user]: sendFileToUserTool,
        [Tools.workspace_pull_file]: pullFileToWorkspaceTool,
        [Tools.list_my_files]: listMyFilesTool,
      };
      requestedTools[tool] = async () => {
        await ensureWorkspaceInjected();
        return toolMap[tool];
      };
      continue;
    } else if (
      tool === Tools.generate_code ||
      tool === Tools.install_dependencies ||
      tool === Tools.lint ||
      tool === Tools.run_program ||
      tool === Tools.workspace_status ||
      tool === Tools.workspace_init ||
      tool === Tools.reset_workspace ||
      tool === Tools.update_todo ||
      tool === Tools.create_plan
    ) {
      const conversationId = options.req?.body?.conversationId ?? options.conversationId;
      const agentId = agent?.id;
      const userId = user;
      if (!conversationId && !(agentId && userId)) {
        continue;
      }
      const codeGen = options.req?.config?.config?.codeGeneration ?? options.req?.config?.codeGeneration;
      if (tool === Tools.generate_code && !codeGen) {
        continue;
      }
      const pathMod = require('path');
      const {
        getSessionBaseDir,
        getWorkspaceSessionId,
      } = require('~/server/services/LocalCodeExecution');
      const sessionId = getWorkspaceSessionId({
        agentId,
        userId,
        conversationId,
      });
      const workspaceRoot = pathMod.join(getSessionBaseDir(), sessionId);

      const coderToolMap = {
        ...(codeGen && {
          [Tools.generate_code]: () =>
            createGenerateCodeTool({
              workspaceRoot,
              provider: codeGen.provider,
              model: codeGen.model,
            }),
        }),
        [Tools.install_dependencies]: () => createInstallDependenciesTool({ workspaceRoot }),
        [Tools.lint]: () => createLintTool({ workspaceRoot }),
        [Tools.run_program]: () => createRunProgramTool({ workspaceRoot }),
        [Tools.workspace_status]: () => createWorkspaceStatusTool({ workspaceRoot }),
        [Tools.workspace_init]: () => createWorkspaceInitTool({ workspaceRoot }),
        [Tools.reset_workspace]: () => createResetWorkspaceTool({ workspaceRoot }),
        [Tools.update_todo]: () => createUpdateTodoTool({ workspaceRoot }),
        [Tools.create_plan]: () => createCreatePlanTool({ workspaceRoot }),
      };
      requestedTools[tool] = async () => coderToolMap[tool]();
      continue;
    } else if (tool === Tools.create_pdf) {
      const req = options.req;
      if (!req) {
        logger.warn('[handleTools] create_pdf requires req, skipping');
        continue;
      }
      requestedTools[tool] = async () => createCreatePdfTool({ req });
      continue;
    } else if (tool === Tools.run_tool_and_save) {
      requestedTools[tool] = async () => createRunToolAndSaveTool();
      continue;
    } else if (tool === Tools.create_brainstorm_doc) {
      requestedTools[tool] = async () => createBrainstormDocTool();
      continue;
    } else if (
      tool === Tools.list_schedules ||
      tool === Tools.list_user_projects ||
      tool === Tools.create_schedule ||
      tool === Tools.update_schedule ||
      tool === Tools.delete_schedule ||
      tool === Tools.run_schedule ||
      tool === Tools.list_runs ||
      tool === Tools.get_run
    ) {
      const currentAgent = options.req?.body?.agent ?? agent;
      const currentAgentId = currentAgent?.id ?? agent?.id;
      const schedulerTargetAgentIds = currentAgent?.schedulerTargetAgentIds ?? [];
      const schedulingTools = createSchedulingTools({
        userId: user,
        agentId: currentAgentId,
        schedulerTargetAgentIds,
      });
      requestedTools[tool] = async () => schedulingTools[tool];
      if (!toolContextMap[Tools.create_schedule]) {
        const parts = [SCHEDULER_DEFAULT_INSTRUCTIONS];
        if (schedulerTargetAgentIds.length > 0) {
          try {
            const schedulerContext = await buildSchedulerTargetContext(
              schedulerTargetAgentIds,
              getAgents,
            );
            if (schedulerContext) {
              parts.push(schedulerContext);
            }
          } catch (err) {
            logger.debug('[handleTools] Error building scheduler target context:', err);
          }
        }
        try {
          const promptContext = await buildSchedulerPromptContext(
            user,
            options.req?.user?.role ?? 'USER',
          );
          if (promptContext) {
            parts.push(promptContext);
          }
        } catch (err) {
          logger.debug('[handleTools] Error building scheduler prompt context:', err);
        }
        toolContextMap[Tools.create_schedule] = parts.filter(Boolean).join('\n\n');
      }
      continue;
    } else if (tool === Tools.file_search) {
      requestedTools[tool] = async () => {
        const { files, toolContext } = await primeSearchFiles({
          ...options,
          agentId: agent?.id,
        });
        if (toolContext) {
          toolContextMap[tool] = toolContext;
        }

        /** @type {boolean | undefined} Check if user has FILE_CITATIONS permission */
        let fileCitations;
        if (fileCitations == null && options.req?.user != null) {
          try {
            fileCitations = await checkAccess({
              user: options.req.user,
              permissionType: PermissionTypes.FILE_CITATIONS,
              permissions: [Permissions.USE],
              getRoleByName,
            });
          } catch (error) {
            logger.error('[handleTools] FILE_CITATIONS permission check failed:', error);
            fileCitations = false;
          }
        }

        return createFileSearchTool({
          userId: user,
          files,
          entity_id: agent?.id,
          fileCitations,
          req: options.req,
          agentId: agent?.id,
        });
      };
      continue;
    } else if (tool === Tools.web_search) {
      const result = await loadWebSearchAuth({
        userId: user,
        loadAuthValues,
        webSearchConfig: webSearch,
      });
      const { onSearchResults, onGetHighlights } = options?.[Tools.web_search] ?? {};
      requestedTools[tool] = async () => {
        toolContextMap[tool] = buildWebSearchContext();
        return createSearchTool({
          ...result.authResult,
          onSearchResults,
          onGetHighlights,
          logger,
        });
      };
      continue;
    } else if (CRM_TOOL_NAMES.has(tool)) {
      if (!userProjectId) {
        continue;
      }
      requestedTools[tool] = async () => {
        const crmTools = createCRMTools({ userId: user, projectId: userProjectId });
        return crmTools[tool];
      };
      continue;
    } else if (HUMAN_TOOL_NAMES.has(tool)) {
      if (!userWorkspaceId) {
        continue;
      }
      requestedTools[tool] = async () => {
        const humanTools = createHumanTools({
          userId: user,
          workspaceId: userWorkspaceId,
          conversationId: options.req?.body?.conversationId ?? options.conversationId,
          agentId: agent?.id,
        });
        return humanTools[tool];
      };
      continue;
    } else if (PROJECT_TOOL_NAMES.has(tool)) {
      if (PROJECT_MANAGEMENT_TOOL_NAMES.has(tool)) {
        requestedTools[tool] = async () => {
          const mgmtTools = createProjectManagementTools({
            userId: user,
            conversationId: options.req?.body?.conversationId ?? options.conversationId,
            req: options.req,
          });
          return mgmtTools[tool];
        };
      } else {
        requestedTools[tool] = async () => {
          const projectTools = createProjectTools({
            userId: user,
            conversationId: options.req?.body?.conversationId ?? options.conversationId,
            req: options.req,
          });
          return projectTools[tool];
        };
      }
      continue;
    } else if (tool && mcpToolPattern.test(tool)) {
      const toolParts = tool.split(Constants.mcp_delimiter);
      const serverName = toolParts.pop();
      const toolName = toolParts.join(Constants.mcp_delimiter);
      if (toolName === Constants.mcp_server) {
        /** Placeholder used for UI purposes */
        continue;
      }
      const serverConfig = serverName
        ? await getMCPServersRegistry().getServerConfig(serverName, user)
        : null;
      if (!serverConfig) {
        logger.warn(
          `MCP server "${serverName}" for "${toolName}" tool is not configured${agent?.id != null && agent.id ? ` but attached to "${agent.id}"` : ''}`,
        );
        continue;
      }
      if (toolName === Constants.mcp_all) {
        requestedMCPTools[serverName] = [
          {
            type: 'all',
            serverName,
            config: serverConfig,
          },
        ];
        continue;
      }

      requestedMCPTools[serverName] = requestedMCPTools[serverName] || [];
      requestedMCPTools[serverName].push({
        type: 'single',
        toolKey: tool,
        serverName,
        config: serverConfig,
      });
      continue;
    }

    if (customConstructors[tool]) {
      requestedTools[tool] = async () => customConstructors[tool](toolContextMap);
      continue;
    }

    if (toolConstructors[tool]) {
      const options = toolOptions[tool] || {};
      const toolInstance = loadToolWithAuth(
        user,
        getAuthFields(tool),
        toolConstructors[tool],
        options,
      );
      requestedTools[tool] = toolInstance;
      continue;
    }
  }

  if (returnMap) {
    return requestedTools;
  }

  const toolPromises = [];
  for (const tool of tools) {
    const validTool = requestedTools[tool];
    if (validTool) {
      toolPromises.push(
        validTool().catch((error) => {
          logger.error(`Error loading tool ${tool}:`, error);
          return null;
        }),
      );
    }
  }

  const loadedTools = (await Promise.all(toolPromises)).flatMap((plugin) => plugin || []);
  const mcpToolPromises = [];
  /** MCP server tools are initialized sequentially by server */
  let index = -1;
  const failedMCPServers = new Set();
  const safeUser = createSafeUser(options.req?.user);
  for (const [serverName, toolConfigs] of Object.entries(requestedMCPTools)) {
    index++;
    /** @type {LCAvailableTools} */
    let availableTools;
    for (const config of toolConfigs) {
      try {
        if (failedMCPServers.has(serverName)) {
          continue;
        }
        const mcpParams = {
          req: options.req,
          index,
          signal,
          user: safeUser,
          userMCPAuthMap,
          res: options.res,
          streamId: options.req?._resumableStreamId || null,
          model: agent?.model ?? model,
          serverName: config.serverName,
          provider: agent?.provider ?? endpoint,
          config: config.config,
        };

        if (config.type === 'all' && toolConfigs.length === 1) {
          /** Handle async loading for single 'all' tool config */
          mcpToolPromises.push(
            createMCPTools(mcpParams).catch((error) => {
              logger.error(`Error loading ${serverName} tools:`, error);
              return null;
            }),
          );
          continue;
        }
        if (!availableTools) {
          try {
            availableTools = await getMCPServerTools(safeUser.id, serverName);
          } catch (error) {
            logger.error(`Error fetching available tools for MCP server ${serverName}:`, error);
          }
        }

        /** Handle synchronous loading */
        const mcpTool =
          config.type === 'all'
            ? await createMCPTools(mcpParams)
            : await createMCPTool({
                ...mcpParams,
                availableTools,
                toolKey: config.toolKey,
              });

        if (Array.isArray(mcpTool)) {
          loadedTools.push(...mcpTool);
        } else if (mcpTool) {
          loadedTools.push(mcpTool);
        } else {
          failedMCPServers.add(serverName);
          logger.warn(
            `MCP tool creation failed for "${config.toolKey}", server may be unavailable or unauthenticated.`,
          );
        }
      } catch (error) {
        logger.error(`Error loading MCP tool for server ${serverName}:`, error);
      }
    }
  }
  loadedTools.push(...(await Promise.all(mcpToolPromises)).flatMap((plugin) => plugin || []));
  return { loadedTools, toolContextMap };
};

module.exports = {
  loadToolWithAuth,
  validateTools,
  loadTools,
};
