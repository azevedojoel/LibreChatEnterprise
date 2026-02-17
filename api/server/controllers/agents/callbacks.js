const { nanoid } = require('nanoid');
const { Constants } = require('@librechat/agents');
const { logger } = require('@librechat/data-schemas');
const {
  sendEvent,
  GenerationJobManager,
  writeAttachmentEvent,
  createToolExecuteHandler,
} = require('@librechat/api');
const { Tools, StepTypes, FileContext, ErrorTypes } = require('librechat-data-provider');
const {
  Providers,
  GraphEvents,
  getMessageId,
  ToolEndHandler,
  handleToolCalls,
  ChatModelStreamHandler,
} = require('@librechat/agents');
const { processFileCitations } = require('~/server/services/Files/Citations');
const { processLocalCodeOutput } = require('~/server/services/Files/Code/processLocalOutput');
const { saveBase64Image } = require('~/server/services/Files/process');

class ModelEndHandler {
  /**
   * @param {Array<UsageMetadata>} collectedUsage
   */
  constructor(collectedUsage) {
    if (!Array.isArray(collectedUsage)) {
      throw new Error('collectedUsage must be an array');
    }
    this.collectedUsage = collectedUsage;
  }

  finalize(errorMessage) {
    if (!errorMessage) {
      return;
    }
    throw new Error(errorMessage);
  }

  /**
   * @param {string} event
   * @param {ModelEndData | undefined} data
   * @param {Record<string, unknown> | undefined} metadata
   * @param {StandardGraph} graph
   * @returns {Promise<void>}
   */
  async handle(event, data, metadata, graph) {
    if (!graph || !metadata) {
      console.warn(`Graph or metadata not found in ${event} event`);
      return;
    }

    /** @type {string | undefined} */
    let errorMessage;
    try {
      const agentContext = graph.getAgentContext(metadata);
      const isGoogle = agentContext.provider === Providers.GOOGLE;
      const streamingDisabled = !!agentContext.clientOptions?.disableStreaming;
      if (data?.output?.additional_kwargs?.stop_reason === 'refusal') {
        const info = { ...data.output.additional_kwargs };
        errorMessage = JSON.stringify({
          type: ErrorTypes.REFUSAL,
          info,
        });
        logger.debug(`[ModelEndHandler] Model refused to respond`, {
          ...info,
          userId: metadata.user_id,
          messageId: metadata.run_id,
          conversationId: metadata.thread_id,
        });
      }

      const toolCalls = data?.output?.tool_calls;
      let hasUnprocessedToolCalls = false;
      if (Array.isArray(toolCalls) && toolCalls.length > 0 && graph?.toolCallStepIds?.has) {
        try {
          hasUnprocessedToolCalls = toolCalls.some(
            (tc) => tc?.id && !graph.toolCallStepIds.has(tc.id),
          );
        } catch {
          hasUnprocessedToolCalls = false;
        }
      }
      if (isGoogle || streamingDisabled || hasUnprocessedToolCalls) {
        await handleToolCalls(toolCalls, metadata, graph);
      }

      const usage = data?.output?.usage_metadata;
      if (!usage) {
        return this.finalize(errorMessage);
      }
      const modelName = metadata?.ls_model_name || agentContext.clientOptions?.model;
      if (modelName) {
        usage.model = modelName;
      }

      this.collectedUsage.push(usage);
      if (!streamingDisabled) {
        return this.finalize(errorMessage);
      }
      if (!data.output.content) {
        return this.finalize(errorMessage);
      }
      const stepKey = graph.getStepKey(metadata);
      const message_id = getMessageId(stepKey, graph) ?? '';
      if (message_id) {
        await graph.dispatchRunStep(stepKey, {
          type: StepTypes.MESSAGE_CREATION,
          message_creation: {
            message_id,
          },
        });
      }
      const stepId = graph.getStepIdByKey(stepKey);
      const content = data.output.content;
      if (typeof content === 'string') {
        await graph.dispatchMessageDelta(stepId, {
          content: [
            {
              type: 'text',
              text: content,
            },
          ],
        });
      } else if (content.every((c) => c.type?.startsWith('text'))) {
        await graph.dispatchMessageDelta(stepId, {
          content,
        });
      }
    } catch (error) {
      logger.error('Error handling model end event:', error);
      return this.finalize(errorMessage);
    }
  }
}

/**
 * @deprecated Agent Chain helper
 * @param {string | undefined} [last_agent_id]
 * @param {string | undefined} [langgraph_node]
 * @returns {boolean}
 */
function checkIfLastAgent(last_agent_id, langgraph_node) {
  if (!last_agent_id || !langgraph_node) {
    return false;
  }
  return langgraph_node?.endsWith(last_agent_id);
}

/**
 * Helper to emit events either to res (standard mode) or to job emitter (resumable mode).
 * In Redis mode, awaits the emit to guarantee event ordering (critical for streaming deltas).
 * @param {ServerResponse} res - The server response object
 * @param {string | null} streamId - The stream ID for resumable mode, or null for standard mode
 * @param {Object} eventData - The event data to send
 * @returns {Promise<void>}
 */
async function emitEvent(res, streamId, eventData) {
  if (streamId) {
    await GenerationJobManager.emitChunk(streamId, eventData);
  } else {
    sendEvent(res, eventData);
  }
}

/**
 * @typedef {Object} ToolExecuteOptions
 * @property {(toolNames: string[]) => Promise<{loadedTools: StructuredTool[]}>} loadTools - Function to load tools by name
 * @property {Object} configurable - Configurable context for tool invocation
 */

/**
 * Get default handlers for stream events.
 * @param {Object} options - The options object.
 * @param {ServerResponse} options.res - The server response object.
 * @param {ContentAggregator} options.aggregateContent - Content aggregator function.
 * @param {ToolEndCallback} options.toolEndCallback - Callback to use when tool ends.
 * @param {Array<UsageMetadata>} options.collectedUsage - The list of collected usage metadata.
 * @param {string | null} [options.streamId] - The stream ID for resumable mode, or null for standard mode.
 * @param {ToolExecuteOptions} [options.toolExecuteOptions] - Options for event-driven tool execution.
 * @param {{ currentAgentId: string | null }} [options.handoffState] - When ON_HANDOFF fires (direct handoff tools), set currentAgentId for subsequent replies.
 * @returns {Record<string, t.EventHandler>} The default handlers.
 * @throws {Error} If the request is not found.
 */
function getDefaultHandlers({
  res,
  aggregateContent,
  toolEndCallback,
  collectedUsage,
  streamId = null,
  toolExecuteOptions = null,
  handoffState = null,
}) {
  if (!res || !aggregateContent) {
    throw new Error(
      `[getDefaultHandlers] Missing required options: res: ${!res}, aggregateContent: ${!aggregateContent}`,
    );
  }
  const handlers = {
    [GraphEvents.CHAT_MODEL_END]: new ModelEndHandler(collectedUsage),
    [GraphEvents.TOOL_END]: new ToolEndHandler(toolEndCallback, logger),
    [GraphEvents.CHAT_MODEL_STREAM]: new ChatModelStreamHandler(),
    [GraphEvents.ON_RUN_STEP]: {
      /**
       * Handle ON_RUN_STEP event.
       * @param {string} event - The event name.
       * @param {StreamEventData} data - The event data.
       * @param {GraphRunnableConfig['configurable']} [metadata] The runnable metadata.
       */
      handle: async (event, data, metadata) => {
        aggregateContent({ event, data });
        if (data?.stepDetails.type === StepTypes.TOOL_CALLS) {
          await emitEvent(res, streamId, { event, data });
        } else if (checkIfLastAgent(metadata?.last_agent_id, metadata?.langgraph_node)) {
          await emitEvent(res, streamId, { event, data });
        } else if (!metadata?.hide_sequential_outputs) {
          await emitEvent(res, streamId, { event, data });
        } else {
          const agentName = metadata?.name ?? 'Agent';
          const isToolCall = data?.stepDetails.type === StepTypes.TOOL_CALLS;
          const action = isToolCall ? 'performing a task...' : 'thinking...';
          await emitEvent(res, streamId, {
            event: 'on_agent_update',
            data: {
              runId: metadata?.run_id,
              message: `${agentName} is ${action}`,
            },
          });
        }
      },
    },
    [GraphEvents.ON_RUN_STEP_DELTA]: {
      /**
       * Handle ON_RUN_STEP_DELTA event.
       * @param {string} event - The event name.
       * @param {StreamEventData} data - The event data.
       * @param {GraphRunnableConfig['configurable']} [metadata] The runnable metadata.
       */
      handle: async (event, data, metadata) => {
        aggregateContent({ event, data });
        if (data?.delta.type === StepTypes.TOOL_CALLS) {
          await emitEvent(res, streamId, { event, data });
        } else if (checkIfLastAgent(metadata?.last_agent_id, metadata?.langgraph_node)) {
          await emitEvent(res, streamId, { event, data });
        } else if (!metadata?.hide_sequential_outputs) {
          await emitEvent(res, streamId, { event, data });
        }
      },
    },
    [GraphEvents.ON_RUN_STEP_COMPLETED]: {
      /**
       * Handle ON_RUN_STEP_COMPLETED event.
       * @param {string} event - The event name.
       * @param {StreamEventData & { result: ToolEndData }} data - The event data.
       * @param {GraphRunnableConfig['configurable']} [metadata] The runnable metadata.
       */
      handle: async (event, data, metadata) => {
        // Ensure result.index is set BEFORE aggregateContent (needed for fallback resolution)
        if (data?.result != null && typeof data.result.index !== 'number') {
          data.result.index = 0;
        }
        aggregateContent({ event, data });
        // Diagnostic: verify tool_call has output for tool-call-cancelled fix
        const toolCall = data?.result?.tool_call;
        if (
          data?.result != null &&
          toolCall &&
          (toolCall.output == null || toolCall.output === '')
        ) {
          logger.debug('[ON_RUN_STEP_COMPLETED] tool_call missing output', {
            stepId: data.result.id,
            toolName: toolCall.name,
          });
        }
        if (data?.result != null) {
          await emitEvent(res, streamId, { event, data });
        } else if (checkIfLastAgent(metadata?.last_agent_id, metadata?.langgraph_node)) {
          await emitEvent(res, streamId, { event, data });
        } else if (!metadata?.hide_sequential_outputs) {
          await emitEvent(res, streamId, { event, data });
        }
      },
    },
    [GraphEvents.ON_MESSAGE_DELTA]: {
      /**
       * Handle ON_MESSAGE_DELTA event.
       * @param {string} event - The event name.
       * @param {StreamEventData} data - The event data.
       * @param {GraphRunnableConfig['configurable']} [metadata] The runnable metadata.
       */
      handle: async (event, data, metadata) => {
        aggregateContent({ event, data });
        if (checkIfLastAgent(metadata?.last_agent_id, metadata?.langgraph_node)) {
          await emitEvent(res, streamId, { event, data });
        } else if (!metadata?.hide_sequential_outputs) {
          await emitEvent(res, streamId, { event, data });
        }
      },
    },
    [GraphEvents.ON_REASONING_DELTA]: {
      /**
       * Handle ON_REASONING_DELTA event.
       * @param {string} event - The event name.
       * @param {StreamEventData} data - The event data.
       * @param {GraphRunnableConfig['configurable']} [metadata] The runnable metadata.
       */
      handle: async (event, data, metadata) => {
        aggregateContent({ event, data });
        if (checkIfLastAgent(metadata?.last_agent_id, metadata?.langgraph_node)) {
          await emitEvent(res, streamId, { event, data });
        } else if (!metadata?.hide_sequential_outputs) {
          await emitEvent(res, streamId, { event, data });
        }
      },
    },
  };

  if (toolExecuteOptions) {
    handlers[GraphEvents.ON_TOOL_EXECUTE] = createToolExecuteHandler(toolExecuteOptions);
  }

  /** ON_HANDOFF: Fired when direct handoff tools complete - update handoffState and emit agent_handoff */
  const onHandoffEvent = GraphEvents.ON_HANDOFF ?? 'on_handoff';
  handlers[onHandoffEvent] = {
    handle: async (_event, data) => {
      const targetAgentId =
        data?.destinationAgentId ??
        (data?.toolName && typeof data.toolName === 'string'
          ? data.toolName.replace(Constants.LC_TRANSFER_TO_, '')
          : null);
      if (handoffState && targetAgentId) {
        handoffState.currentAgentId = targetAgentId;
        if (streamId) {
          await emitEvent(res, streamId, {
            event: 'agent_handoff',
            data: { agent_id: targetAgentId },
          });
        }
      }
    },
  };

  return handlers;
}

/**
 * Helper to write attachment events either to res or to job emitter.
 * Note: Attachments are not order-sensitive like deltas, so fire-and-forget is acceptable.
 * @param {ServerResponse} res - The server response object
 * @param {string | null} streamId - The stream ID for resumable mode, or null for standard mode
 * @param {Object} attachment - The attachment data
 */
function writeAttachment(res, streamId, attachment) {
  if (streamId) {
    GenerationJobManager.emitChunk(streamId, { event: 'attachment', data: attachment });
  } else {
    res.write(`event: attachment\ndata: ${JSON.stringify(attachment)}\n\n`);
  }
}

/**
 *
 * @param {Object} params
 * @param {ServerRequest} params.req
 * @param {ServerResponse} params.res
 * @param {Promise<MongoFile | { filename: string; filepath: string; expires: number;} | null>[]} params.artifactPromises
 * @param {string | null} [params.streamId] - The stream ID for resumable mode, or null for standard mode.
 * @param {{ currentAgentId: string | null }} [params.handoffState] - When handoff tool completes, set currentAgentId so conversation uses it for subsequent replies.
 * @returns {ToolEndCallback} The tool end callback.
 */
function createToolEndCallback({
  req,
  res,
  artifactPromises,
  streamId = null,
  handoffState = null,
}) {
  /**
   * @type {ToolEndCallback}
   */
  return async (data, metadata) => {
    const output = data?.output;
    if (!output) {
      return;
    }

    /** Detect handoff tool to switch conversation to handed-off agent for subsequent replies */
    const toolName = output.name;
    if (
      handoffState &&
      toolName &&
      typeof toolName === 'string' &&
      toolName.startsWith(Constants.LC_TRANSFER_TO_)
    ) {
      const targetAgentId = toolName.replace(Constants.LC_TRANSFER_TO_, '');
      if (targetAgentId) {
        handoffState.currentAgentId = targetAgentId;
        /** Emit dedicated event for immediate UI update (resumable mode only) */
        if (streamId) {
          await emitEvent(res, streamId, {
            event: 'agent_handoff',
            data: { agent_id: targetAgentId },
          });
        }
      }
    }

    if (!output.artifact) {
      return;
    }

    if (output.artifact[Tools.file_search]) {
      artifactPromises.push(
        (async () => {
          const user = req.user;
          const attachment = await processFileCitations({
            user,
            metadata,
            appConfig: req.config,
            toolArtifact: output.artifact,
            toolCallId: output.tool_call_id,
          });
          if (!attachment) {
            return null;
          }
          if (!streamId && !res.headersSent) {
            return attachment;
          }
          writeAttachment(res, streamId, attachment);
          return attachment;
        })().catch((error) => {
          logger.error('Error processing file citations:', error);
          return null;
        }),
      );
    }

    if (output.artifact[Tools.ui_resources]) {
      artifactPromises.push(
        (async () => {
          const attachment = {
            type: Tools.ui_resources,
            messageId: metadata.run_id,
            toolCallId: output.tool_call_id,
            conversationId: metadata.thread_id,
            [Tools.ui_resources]: output.artifact[Tools.ui_resources].data,
          };
          if (!streamId && !res.headersSent) {
            return attachment;
          }
          writeAttachment(res, streamId, attachment);
          return attachment;
        })().catch((error) => {
          logger.error('Error processing artifact content:', error);
          return null;
        }),
      );
    }

    if (output.artifact[Tools.web_search]) {
      artifactPromises.push(
        (async () => {
          const attachment = {
            type: Tools.web_search,
            messageId: metadata.run_id,
            toolCallId: output.tool_call_id,
            conversationId: metadata.thread_id,
            [Tools.web_search]: { ...output.artifact[Tools.web_search] },
          };
          if (!streamId && !res.headersSent) {
            return attachment;
          }
          writeAttachment(res, streamId, attachment);
          return attachment;
        })().catch((error) => {
          logger.error('Error processing artifact content:', error);
          return null;
        }),
      );
    }

    if (output.artifact.content) {
      /** @type {FormattedContent[]} */
      const content = output.artifact.content;
      for (let i = 0; i < content.length; i++) {
        const part = content[i];
        if (!part) {
          continue;
        }
        if (part.type !== 'image_url') {
          continue;
        }
        const { url } = part.image_url;
        artifactPromises.push(
          (async () => {
            const filename = `${output.name}_img_${nanoid()}`;
            const file_id = output.artifact.file_ids?.[i];
            const file = await saveBase64Image(url, {
              req,
              file_id,
              filename,
              endpoint: metadata.provider,
              context: FileContext.image_generation,
            });
            const fileMetadata = Object.assign(file, {
              messageId: metadata.run_id,
              toolCallId: output.tool_call_id,
              conversationId: metadata.thread_id,
            });
            if (!streamId && !res.headersSent) {
              return fileMetadata;
            }

            if (!fileMetadata) {
              return null;
            }

            writeAttachment(res, streamId, fileMetadata);
            return fileMetadata;
          })().catch((error) => {
            logger.error('Error processing artifact content:', error);
            return null;
          }),
        );
      }
      return;
    }

    const isCodeTool =
      output.name === Tools.execute_code || output.name === Constants.PROGRAMMATIC_TOOL_CALLING;
    if (!isCodeTool) {
      return;
    }

    if (!output.artifact.files) {
      return;
    }

    for (const file of output.artifact.files) {
      const { name, buffer } = file;
      if (!buffer) {
        logger.warn('[createToolEndCallback] Code artifact file missing buffer, skipping');
        continue;
      }
      artifactPromises.push(
        (async () => {
          const fileMetadata = await processLocalCodeOutput({
            req,
            buffer,
            name,
            session_id: output.artifact.session_id,
            messageId: metadata.run_id,
            toolCallId: output.tool_call_id,
            conversationId: metadata.thread_id,
          });
          if (!streamId && !res.headersSent) {
            return fileMetadata;
          }

          if (!fileMetadata) {
            return null;
          }

          writeAttachment(res, streamId, fileMetadata);
          return fileMetadata;
        })().catch((error) => {
          logger.error('Error processing code output:', error);
          return null;
        }),
      );
    }
  };
}

/**
 * Helper to write attachment events in Open Responses format (librechat:attachment)
 * @param {ServerResponse} res - The server response object
 * @param {Object} tracker - The response tracker with sequence number
 * @param {Object} attachment - The attachment data
 * @param {Object} metadata - Additional metadata (messageId, conversationId)
 */
function writeResponsesAttachment(res, tracker, attachment, metadata) {
  const sequenceNumber = tracker.nextSequence();
  writeAttachmentEvent(res, sequenceNumber, attachment, {
    messageId: metadata.run_id,
    conversationId: metadata.thread_id,
  });
}

/**
 * Creates a tool end callback specifically for the Responses API.
 * Emits attachments as `librechat:attachment` events per the Open Responses extension spec.
 *
 * @param {Object} params
 * @param {ServerRequest} params.req
 * @param {ServerResponse} params.res
 * @param {Object} params.tracker - Response tracker with sequence number
 * @param {Promise<MongoFile | { filename: string; filepath: string; expires: number;} | null>[]} params.artifactPromises
 * @returns {ToolEndCallback} The tool end callback.
 */
function createResponsesToolEndCallback({ req, res, tracker, artifactPromises }) {
  /**
   * @type {ToolEndCallback}
   */
  return async (data, metadata) => {
    const output = data?.output;
    if (!output) {
      return;
    }

    if (!output.artifact) {
      return;
    }

    if (output.artifact[Tools.file_search]) {
      artifactPromises.push(
        (async () => {
          const user = req.user;
          const attachment = await processFileCitations({
            user,
            metadata,
            appConfig: req.config,
            toolArtifact: output.artifact,
            toolCallId: output.tool_call_id,
          });
          if (!attachment) {
            return null;
          }
          // For Responses API, emit attachment during streaming
          if (res.headersSent && !res.writableEnded) {
            writeResponsesAttachment(res, tracker, attachment, metadata);
          }
          return attachment;
        })().catch((error) => {
          logger.error('Error processing file citations:', error);
          return null;
        }),
      );
    }

    if (output.artifact[Tools.ui_resources]) {
      artifactPromises.push(
        (async () => {
          const attachment = {
            type: Tools.ui_resources,
            toolCallId: output.tool_call_id,
            [Tools.ui_resources]: output.artifact[Tools.ui_resources].data,
          };
          // For Responses API, always emit attachment during streaming
          if (res.headersSent && !res.writableEnded) {
            writeResponsesAttachment(res, tracker, attachment, metadata);
          }
          return attachment;
        })().catch((error) => {
          logger.error('Error processing artifact content:', error);
          return null;
        }),
      );
    }

    if (output.artifact[Tools.web_search]) {
      artifactPromises.push(
        (async () => {
          const attachment = {
            type: Tools.web_search,
            toolCallId: output.tool_call_id,
            [Tools.web_search]: { ...output.artifact[Tools.web_search] },
          };
          // For Responses API, always emit attachment during streaming
          if (res.headersSent && !res.writableEnded) {
            writeResponsesAttachment(res, tracker, attachment, metadata);
          }
          return attachment;
        })().catch((error) => {
          logger.error('Error processing artifact content:', error);
          return null;
        }),
      );
    }

    if (output.artifact.content) {
      /** @type {FormattedContent[]} */
      const content = output.artifact.content;
      for (let i = 0; i < content.length; i++) {
        const part = content[i];
        if (!part) {
          continue;
        }
        if (part.type !== 'image_url') {
          continue;
        }
        const { url } = part.image_url;
        artifactPromises.push(
          (async () => {
            const filename = `${output.name}_img_${nanoid()}`;
            const file_id = output.artifact.file_ids?.[i];
            const file = await saveBase64Image(url, {
              req,
              file_id,
              filename,
              endpoint: metadata.provider,
              context: FileContext.image_generation,
            });
            const fileMetadata = Object.assign(file, {
              toolCallId: output.tool_call_id,
            });

            if (!fileMetadata) {
              return null;
            }

            // For Responses API, emit attachment during streaming
            if (res.headersSent && !res.writableEnded) {
              const attachment = {
                file_id: fileMetadata.file_id,
                filename: fileMetadata.filename,
                type: fileMetadata.type,
                url: fileMetadata.filepath,
                width: fileMetadata.width,
                height: fileMetadata.height,
                tool_call_id: output.tool_call_id,
              };
              writeResponsesAttachment(res, tracker, attachment, metadata);
            }

            return fileMetadata;
          })().catch((error) => {
            logger.error('Error processing artifact content:', error);
            return null;
          }),
        );
      }
      return;
    }

    const isCodeTool =
      output.name === Tools.execute_code || output.name === Constants.PROGRAMMATIC_TOOL_CALLING;
    if (!isCodeTool) {
      return;
    }

    if (!output.artifact.files) {
      return;
    }

    for (const file of output.artifact.files) {
      const { name, buffer } = file;
      if (!buffer) {
        logger.warn('[createResponsesToolEndCallback] Code artifact file missing buffer, skipping');
        continue;
      }
      artifactPromises.push(
        (async () => {
          const fileMetadata = await processLocalCodeOutput({
            req,
            buffer,
            name,
            session_id: output.artifact.session_id,
            messageId: metadata.run_id,
            toolCallId: output.tool_call_id,
            conversationId: metadata.thread_id,
          });

          if (!fileMetadata) {
            return null;
          }

          // For Responses API, emit attachment during streaming
          if (res.headersSent && !res.writableEnded) {
            const attachment = {
              file_id: fileMetadata.file_id,
              filename: fileMetadata.filename,
              type: fileMetadata.type,
              url: fileMetadata.filepath,
              width: fileMetadata.width,
              height: fileMetadata.height,
              tool_call_id: output.tool_call_id,
            };
            writeResponsesAttachment(res, tracker, attachment, metadata);
          }

          return fileMetadata;
        })().catch((error) => {
          logger.error('Error processing code output:', error);
          return null;
        }),
      );
    }
  };
}

module.exports = {
  getDefaultHandlers,
  createToolEndCallback,
  createResponsesToolEndCallback,
};
