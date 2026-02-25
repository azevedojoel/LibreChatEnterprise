import { logger } from '@librechat/data-schemas';
import { GraphEvents, Constants } from '@librechat/agents';
import { isToolSearchTool } from '~/tools/classification';
import type {
  LCTool,
  EventHandler,
  LCToolRegistry,
  ToolCallRequest,
  ToolExecuteResult,
  ToolExecuteBatchRequest,
} from '@librechat/agents';
import type { StructuredToolInterface } from '@langchain/core/tools';

export interface ToolEndCallbackData {
  output: {
    name: string;
    tool_call_id: string;
    content: string | unknown;
    artifact?: unknown;
  };
}

export interface ToolEndCallbackMetadata {
  run_id?: string;
  thread_id?: string;
  [key: string]: unknown;
}

export type ToolEndCallback = (
  data: ToolEndCallbackData,
  metadata: ToolEndCallbackMetadata,
) => Promise<void>;

/** Marker for headless OAuth URL in error message (from MCP.js) */
const HEADLESS_OAUTH_URL_MARKER = 'To authenticate, open this URL in your browser:\n';

export interface ToolExecuteOptions {
  /** Loads tools by name, using agentId to look up agent-specific context */
  loadTools: (
    toolNames: string[],
    agentId?: string,
  ) => Promise<{
    loadedTools: StructuredToolInterface[];
    /** Additional configurable properties to merge (e.g., userMCPAuthMap) */
    configurable?: Record<string, unknown>;
  }>;
  /** Callback to process tool artifacts (code output files, file citations, etc.) */
  toolEndCallback?: ToolEndCallback;
  /** Callback to capture OAuth URL when headless OAuth error occurs (e.g., inbound email) */
  captureOAuthUrl?: (url: string, options?: { serverName?: string }) => void;
  /** Check if a tool requires user confirmation before execution */
  isDestructiveTool?: (toolName: string) => boolean;
  /** Request user confirmation for destructive tools. Returns { approved } - if false, tool is not executed */
  requestToolConfirmation?: (
    toolCall: ToolCallRequest,
    metadata: Record<string, unknown>,
  ) => Promise<{ approved: boolean }>;
}

/**
 * Creates the ON_TOOL_EXECUTE handler for event-driven tool execution.
 * This handler receives batched tool calls, loads the required tools,
 * executes them in parallel, and resolves with the results.
 */
export function createToolExecuteHandler(options: ToolExecuteOptions): EventHandler {
  const { loadTools, toolEndCallback, captureOAuthUrl, isDestructiveTool, requestToolConfirmation } =
    options;

  return {
    handle: async (_event: string, data: ToolExecuteBatchRequest) => {
      const { toolCalls, agentId, configurable, metadata, resolve, reject } = data;

      try {
        const toolNames = [...new Set(toolCalls.map((tc: ToolCallRequest) => tc.name))];
        const { loadedTools, configurable: toolConfigurable } = await loadTools(toolNames, agentId);
        const toolMap = new Map(loadedTools.map((t) => [t.name, t]));

        // Alias: some providers (e.g. DeepSeek, OpenAI Assistants) use "code_interpreter"
        // but LibreChat registers the tool as "execute_code"
        const executeCodeTool = toolMap.get(Constants.EXECUTE_CODE);
        if (executeCodeTool) {
          toolMap.set('code_interpreter', executeCodeTool);
        }

        // Alias: tool_search_mcp_* (stale from cache/history) -> tool_search
        const toolSearchTool = toolMap.get('tool_search');
        if (toolSearchTool) {
          for (const tc of toolCalls) {
            if (typeof tc.name === 'string' && tc.name.startsWith('tool_search_mcp_')) {
              toolMap.set(tc.name, toolSearchTool);
            }
          }
        }

        const mergedConfigurable = { ...configurable, ...toolConfigurable };

        const results: ToolExecuteResult[] = await Promise.all(
          toolCalls.map(async (tc: ToolCallRequest) => {
            const tool = toolMap.get(tc.name);

            if (!tool) {
              logger.warn(
                `[ON_TOOL_EXECUTE] Tool "${tc.name}" not found. Available: ${[...toolMap.keys()].join(', ')}`,
              );
              return {
                toolCallId: tc.id,
                status: 'error' as const,
                content: '',
                errorMessage: `Tool ${tc.name} not found`,
              };
            }

            try {
              const toolCallConfig: Record<string, unknown> = {
                id: tc.id,
                stepId: tc.stepId,
                turn: tc.turn,
              };

              if (
                tc.codeSessionContext &&
                (tc.name === Constants.EXECUTE_CODE ||
                  tc.name === Constants.PROGRAMMATIC_TOOL_CALLING)
              ) {
                toolCallConfig.session_id = tc.codeSessionContext.session_id;
                if (tc.codeSessionContext.files && tc.codeSessionContext.files.length > 0) {
                  toolCallConfig._injected_files = tc.codeSessionContext.files;
                }
              }

              if (tc.name === Constants.PROGRAMMATIC_TOOL_CALLING) {
                const toolRegistry = mergedConfigurable?.toolRegistry as LCToolRegistry | undefined;
                const ptcToolMap = mergedConfigurable?.ptcToolMap as
                  | Map<string, StructuredToolInterface>
                  | undefined;
                if (toolRegistry) {
                  const toolDefs: LCTool[] = Array.from(toolRegistry.values()).filter(
                    (t) =>
                      t.name !== Constants.PROGRAMMATIC_TOOL_CALLING &&
                      !isToolSearchTool(t.name),
                  );
                  toolCallConfig.toolDefs = toolDefs;
                  toolCallConfig.toolMap = ptcToolMap ?? toolMap;
                }
              }

              if (
                isDestructiveTool?.(tc.name) &&
                requestToolConfirmation
              ) {
                const metadataRecord = (metadata ?? {}) as Record<string, unknown>;
                const { approved } = await requestToolConfirmation(tc, metadataRecord);
                if (!approved) {
                  return {
                    toolCallId: tc.id,
                    status: 'error' as const,
                    content: '',
                    errorMessage: 'User denied execution.',
                  };
                }
              }

              const result = await tool.invoke(tc.args, {
                toolCall: toolCallConfig,
                configurable: mergedConfigurable,
                metadata,
              } as Record<string, unknown>);

              if (toolEndCallback) {
                await toolEndCallback(
                  {
                    output: {
                      name: tc.name,
                      tool_call_id: tc.id,
                      content: result.content,
                      artifact: result.artifact,
                    },
                  },
                  {
                    run_id: (metadata as Record<string, unknown>)?.run_id as string | undefined,
                    thread_id: (metadata as Record<string, unknown>)?.thread_id as
                      | string
                      | undefined,
                    ...metadata,
                  },
                );
              }

              return {
                toolCallId: tc.id,
                content: result.content,
                artifact: result.artifact,
                status: 'success' as const,
              };
            } catch (toolError) {
              const error = toolError as Error;
              logger.error(`[ON_TOOL_EXECUTE] Tool ${tc.name} error:`, error);
              const errorMessage = error.message ?? '';
              let messageForModel = errorMessage;
              const isUserCancelled =
                errorMessage.includes('User cancelled') ||
                errorMessage.includes('does not want to authenticate');
              if (isUserCancelled) {
                messageForModel =
                  'User cancelled authentication and does not want to proceed. Do not retry this integration.';
              }
              const hasOAuthMarker = !isUserCancelled && errorMessage.includes(HEADLESS_OAUTH_URL_MARKER);
              logger.info(`[ON_TOOL_EXECUTE] OAuth check for ${tc.name}`, {
                hasCaptureOAuthUrl: !!captureOAuthUrl,
                hasOAuthMarker,
                errorMessagePreview: errorMessage.slice(0, 120),
              });
              if (captureOAuthUrl && hasOAuthMarker) {
                const url = errorMessage
                  .slice(errorMessage.indexOf(HEADLESS_OAUTH_URL_MARKER) + HEADLESS_OAUTH_URL_MARKER.length)
                  .trim();
                const serverName =
                  typeof tc.name === 'string' && tc.name.includes(Constants.mcp_delimiter)
                    ? tc.name.split(Constants.mcp_delimiter).pop() ?? undefined
                    : undefined;
                logger.info(`[ON_TOOL_EXECUTE] Extracting OAuth URL for email`, {
                  urlLength: url?.length ?? 0,
                  urlPreview: url ? `${url.slice(0, 80)}...` : '(empty)',
                  serverName,
                });
                if (url) {
                  captureOAuthUrl(url, { serverName });
                }
                messageForModel =
                  'OAuth re-authentication required. The authentication URL has been included in the email for you to complete sign-in.';
              }
              return {
                toolCallId: tc.id,
                status: 'error' as const,
                content: '',
                errorMessage: messageForModel,
              };
            }
          }),
        );

        resolve(results);
      } catch (error) {
        const err = error as Error;
        const errorMessage = err?.message ?? '';
        const hasOAuthMarker = errorMessage.includes(HEADLESS_OAUTH_URL_MARKER);

        if (captureOAuthUrl && hasOAuthMarker) {
          const url = errorMessage
            .slice(errorMessage.indexOf(HEADLESS_OAUTH_URL_MARKER) + HEADLESS_OAUTH_URL_MARKER.length)
            .trim();
          const serverName =
            toolCalls.length > 0 && typeof toolCalls[0].name === 'string' && toolCalls[0].name.includes(Constants.mcp_delimiter)
              ? toolCalls[0].name.split(Constants.mcp_delimiter).pop() ?? undefined
              : undefined;
          if (url) {
            captureOAuthUrl(url, { serverName });
          }
          // Resolve with error results so agent gets the "URL included in email" message
          const results: ToolExecuteResult[] = toolCalls.map((tc) => ({
            toolCallId: tc.id,
            status: 'error' as const,
            content: '',
            errorMessage:
              'OAuth re-authentication required. The authentication URL has been included in the email for you to complete sign-in.',
          }));
          resolve(results);
        } else {
          logger.error('[ON_TOOL_EXECUTE] Fatal error:', err);
          reject(err);
        }
      }
    },
  };
}

/**
 * Creates a handlers object that includes ON_TOOL_EXECUTE.
 * Can be merged with other handler objects.
 */
export function createToolExecuteHandlers(
  options: ToolExecuteOptions,
): Record<string, EventHandler> {
  return {
    [GraphEvents.ON_TOOL_EXECUTE]: createToolExecuteHandler(options),
  };
}
