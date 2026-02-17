import pick from 'lodash/pick';
import { logger } from '@librechat/data-schemas';
import { CallToolResultSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { TokenMethods, IUser } from '@librechat/data-schemas';
import type { GraphTokenResolver } from '~/utils/graph';
import type { FlowStateManager } from '~/flow/manager';
import type { MCPOAuthTokens } from './oauth';
import type { RequestBody } from '~/types';
import type * as t from './types';
import { MCPServersInitializer } from './registry/MCPServersInitializer';
import { MCPServerInspector } from './registry/MCPServerInspector';
import { MCPServersRegistry } from './registry/MCPServersRegistry';
import { UserConnectionManager } from './UserConnectionManager';
import { ConnectionsRepository } from './ConnectionsRepository';
import { MCPConnectionFactory } from './MCPConnectionFactory';
import { preProcessGraphTokens } from '~/utils/graph';
import { formatToolContent } from './parsers';
import { getFormatter } from './formatters';
import { MCPConnection } from './connection';
import { processMCPEnv } from '~/utils/env';

/**
 * Centralized manager for MCP server connections and tool execution.
 * Extends UserConnectionManager to handle both app-level and user-specific connections.
 */
export class MCPManager extends UserConnectionManager {
  private static instance: MCPManager | null;

  /** Creates and initializes the singleton MCPManager instance */
  public static async createInstance(configs: t.MCPServers): Promise<MCPManager> {
    if (MCPManager.instance) throw new Error('MCPManager has already been initialized.');
    MCPManager.instance = new MCPManager();
    await MCPManager.instance.initialize(configs);
    return MCPManager.instance;
  }

  /** Returns the singleton MCPManager instance */
  public static getInstance(): MCPManager {
    if (!MCPManager.instance) throw new Error('MCPManager has not been initialized.');
    return MCPManager.instance;
  }

  /** Initializes the MCPManager by setting up server registry and app connections */
  public async initialize(configs: t.MCPServers) {
    await MCPServersInitializer.initialize(configs);
    this.appConnections = new ConnectionsRepository(undefined);
  }

  /** Retrieves an app-level or user-specific connection based on provided arguments */
  public async getConnection(
    args: {
      serverName: string;
      user?: IUser;
      forceNew?: boolean;
      flowManager?: FlowStateManager<MCPOAuthTokens | null>;
    } & Omit<t.OAuthConnectionOptions, 'useOAuth' | 'user' | 'flowManager'>,
  ): Promise<MCPConnection> {
    //the get method checks if the config is still valid as app level
    const existingAppConnection = await this.appConnections!.get(args.serverName);
    if (existingAppConnection) {
      return existingAppConnection;
    } else if (args.user?.id) {
      return this.getUserConnection(args as Parameters<typeof this.getUserConnection>[0]);
    } else {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `No connection found for server ${args.serverName}`,
      );
    }
  }

  /**
   * Discovers tools from an MCP server, even when OAuth is required.
   * Per MCP spec, tool listing should be possible without authentication.
   * Use this for agent initialization to get tool schemas before OAuth flow.
   */
  public async discoverServerTools(args: t.ToolDiscoveryOptions): Promise<t.ToolDiscoveryResult> {
    const { serverName, user } = args;
    const logPrefix = user?.id ? `[MCP][User: ${user.id}][${serverName}]` : `[MCP][${serverName}]`;

    try {
      const existingAppConnection = await this.appConnections?.get(serverName);
      if (existingAppConnection && (await existingAppConnection.isConnected())) {
        const tools = await existingAppConnection.fetchTools();
        return { tools, oauthRequired: false, oauthUrl: null };
      }
    } catch {
      logger.debug(`${logPrefix} [Discovery] App connection not available, trying discovery mode`);
    }

    const serverConfig = (await MCPServersRegistry.getInstance().getServerConfig(
      serverName,
      user?.id,
    )) as t.MCPOptions | null;

    if (!serverConfig) {
      logger.warn(`${logPrefix} [Discovery] Server config not found`);
      return { tools: null, oauthRequired: false, oauthUrl: null };
    }

    const useOAuth = Boolean(
      serverConfig.requiresOAuth || (serverConfig as t.ParsedServerConfig).oauthMetadata,
    );

    const useSSRFProtection = MCPServersRegistry.getInstance().shouldEnableSSRFProtection();
    const basic: t.BasicConnectionOptions = { serverName, serverConfig, useSSRFProtection };

    if (!useOAuth) {
      const result = await MCPConnectionFactory.discoverTools(basic);
      return {
        tools: result.tools,
        oauthRequired: result.oauthRequired,
        oauthUrl: result.oauthUrl,
      };
    }

    if (!user || !args.flowManager) {
      logger.warn(`${logPrefix} [Discovery] OAuth server requires user and flowManager`);
      return { tools: null, oauthRequired: true, oauthUrl: null };
    }

    const result = await MCPConnectionFactory.discoverTools(basic, {
      user,
      useOAuth: true,
      flowManager: args.flowManager,
      tokenMethods: args.tokenMethods,
      signal: args.signal,
      oauthStart: args.oauthStart,
      customUserVars: args.customUserVars,
      requestBody: args.requestBody,
      connectionTimeout: args.connectionTimeout,
    });

    return { tools: result.tools, oauthRequired: result.oauthRequired, oauthUrl: result.oauthUrl };
  }

  /** Returns all available tool functions from app-level connections */
  public async getAppToolFunctions(): Promise<t.LCAvailableTools> {
    const toolFunctions: t.LCAvailableTools = {};
    const configs = await MCPServersRegistry.getInstance().getAllServerConfigs();
    for (const config of Object.values(configs)) {
      if (config.toolFunctions != null) {
        Object.assign(toolFunctions, config.toolFunctions);
      }
    }
    return toolFunctions;
  }

  /** Returns all available tool functions from all connections available to user */
  public async getServerToolFunctions(
    userId: string,
    serverName: string,
  ): Promise<t.LCAvailableTools | null> {
    try {
      //try get the appConnection (if the config is not in the app level anymore any existing connection will disconnect and get will return null)
      const existingAppConnection = await this.appConnections?.get(serverName);
      if (existingAppConnection) {
        return MCPServerInspector.getToolFunctions(serverName, existingAppConnection);
      }

      const userConnections = this.getUserConnections(userId);
      if (!userConnections || userConnections.size === 0) {
        return null;
      }
      if (!userConnections.has(serverName)) {
        return null;
      }

      return MCPServerInspector.getToolFunctions(serverName, userConnections.get(serverName)!);
    } catch (error) {
      logger.warn(
        `[getServerToolFunctions] Error getting tool functions for server ${serverName}`,
        error,
      );
      return null;
    }
  }

  /**
   * Get context for MCP servers (instructions, title, description).
   * Includes servers that have any of: serverInstructions, title, or description.
   * @param serverNames Optional array of server names. If not provided, returns all servers with context.
   * @returns Object mapping server names to their context
   */
  private async getServerContext(
    serverNames?: string[],
  ): Promise<
    Record<string, { instructions?: string; title?: string; description?: string }>
  > {
    const configs = await MCPServersRegistry.getInstance().getAllServerConfigs();
    const context: Record<string, { instructions?: string; title?: string; description?: string }> =
      {};

    for (const [serverName, config] of Object.entries(configs)) {
      const hasInstructions = config.serverInstructions != null;
      const hasTitle = typeof config.title === 'string' && config.title.trim() !== '';
      const hasDescription =
        typeof config.description === 'string' && config.description.trim() !== '';
      if (!hasInstructions && !hasTitle && !hasDescription) {
        continue;
      }

      const entry: { instructions?: string; title?: string; description?: string } = {};
      if (hasInstructions) {
        entry.instructions = config.serverInstructions as string;
      }
      if (hasTitle) {
        entry.title = config.title!.trim();
      }
      if (hasDescription) {
        entry.description = config.description!.trim();
      }
      context[serverName] = entry;
    }

    if (!serverNames) return context;
    return pick(context, serverNames);
  }

  /**
   * Format MCP server instructions for injection into context.
   * Includes server name, display title (if different), description, and instructions.
   * @param serverNames Optional array of server names to include. If not provided, includes all servers with context.
   * @returns Formatted instructions string ready for context injection
   */
  public async formatInstructionsForContext(serverNames?: string[]): Promise<string> {
    const serverContext = await this.getServerContext(serverNames);

    if (Object.keys(serverContext).length === 0) {
      return '';
    }

    const formattedSections = Object.entries(serverContext)
      .map(([serverName, ctx]) => {
        const lines: string[] = [`## ${serverName} MCP Server`];
        if (ctx.title && ctx.title !== serverName) {
          lines.push(`Display name: ${ctx.title}`);
        }
        if (ctx.description) {
          lines.push(ctx.description);
        }
        if (ctx.instructions) {
          lines.push('', ctx.instructions);
        }
        return lines.join('\n').trim();
      })
      .filter(Boolean)
      .join('\n\n');

    return `# MCP Server Instructions

The following MCP servers are available with their specific instructions:

${formattedSections}

Please follow these instructions when using tools from the respective MCP servers.`;
  }

  /**
   * Calls a tool on an MCP server, using either a user-specific connection
   * (if userId is provided) or an app-level connection. Updates the last activity timestamp
   * for user-specific connections upon successful call initiation.
   *
   * @param graphTokenResolver - Optional function to resolve Graph API tokens via OBO flow.
   *   When provided and the server config contains `{{LIBRECHAT_GRAPH_ACCESS_TOKEN}}` placeholders,
   *   they will be resolved to actual Graph API tokens before the tool call.
   */
  async callTool({
    user,
    serverName,
    toolName,
    provider,
    toolArguments,
    options,
    tokenMethods,
    requestBody,
    flowManager,
    oauthStart,
    oauthEnd,
    customUserVars,
    graphTokenResolver,
  }: {
    user?: IUser;
    serverName: string;
    toolName: string;
    provider: t.Provider;
    toolArguments?: Record<string, unknown>;
    options?: RequestOptions;
    requestBody?: RequestBody;
    tokenMethods?: TokenMethods;
    customUserVars?: Record<string, string>;
    flowManager: FlowStateManager<MCPOAuthTokens | null>;
    oauthStart?: (authURL: string) => Promise<void>;
    oauthEnd?: () => Promise<void>;
    graphTokenResolver?: GraphTokenResolver;
  }): Promise<t.FormattedToolResponse> {
    /** User-specific connection */
    let connection: MCPConnection | undefined;
    const userId = user?.id;
    const logPrefix = userId ? `[MCP][User: ${userId}][${serverName}]` : `[MCP][${serverName}]`;

    try {
      if (userId && user) this.updateUserLastActivity(userId);

      // For stdio OAuth servers, always use a fresh connection so the token is injected
      // into the spawned process. Cached connections can have stale/missing env.
      const rawConfig = (await MCPServersRegistry.getInstance().getServerConfig(
        serverName,
        userId,
      )) as t.MCPOptions | null;
      const isStdioOAuth =
        rawConfig &&
        'command' in rawConfig &&
        (rawConfig.requiresOAuth || (rawConfig as t.ParsedServerConfig).oauthMetadata);
      const forceNew = !!(userId && isStdioOAuth);

      connection = await this.getConnection({
        serverName,
        user,
        flowManager,
        tokenMethods,
        oauthStart,
        oauthEnd,
        signal: options?.signal,
        customUserVars,
        requestBody,
        forceNew,
      });

      if (!(await connection.isConnected())) {
        /** May happen if getUserConnection failed silently or app connection dropped */
        throw new McpError(
          ErrorCode.InternalError, // Use InternalError for connection issues
          `${logPrefix} Connection is not active. Cannot execute tool ${toolName}.`,
        );
      }

      if (!rawConfig) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `${logPrefix} Server config not found for ${serverName}.`,
        );
      }

      // Pre-process Graph token placeholders (async) before sync processMCPEnv
      const graphProcessedConfig = await preProcessGraphTokens(rawConfig, {
        user,
        graphTokenResolver,
        scopes: process.env.GRAPH_API_SCOPES,
      });
      const currentOptions = processMCPEnv({
        user,
        options: graphProcessedConfig,
        customUserVars: customUserVars,
        body: requestBody,
      });
      if ('headers' in currentOptions) {
        connection.setRequestHeaders(currentOptions.headers || {});
      }

      const result = await connection.client.request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: toolArguments,
          },
        },
        CallToolResultSchema,
        {
          timeout: connection.timeout,
          resetTimeoutOnProgress: true,
          ...options,
        },
      );
      if (userId) {
        this.updateUserLastActivity(userId);
      }
      this.checkIdleConnections();
      const formatter = getFormatter(currentOptions.outputFormatter);
      return formatToolContent(result as t.MCPToolCallResponse, provider, formatter, {
        serverName,
        toolName,
      });
    } catch (error) {
      // Log with context and re-throw or handle as needed
      logger.error(`${logPrefix}[${toolName}] Tool call failed`, error);
      // Rethrowing allows the caller (createMCPTool) to handle the final user message
      throw error;
    }
  }
}
