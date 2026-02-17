import { useCallback, useRef } from 'react';
import {
  Constants,
  StepTypes,
  ContentTypes,
  ToolCallTypes,
  getNonEmptyValue,
} from 'librechat-data-provider';
import type {
  Agents,
  TMessage,
  PartMetadata,
  ContentMetadata,
  EventSubmission,
  TMessageContentParts,
} from 'librechat-data-provider';
import type { SetterOrUpdater } from 'recoil';
import type { AnnounceOptions } from '~/common';
import { MESSAGE_UPDATE_INTERVAL } from '~/common';
import { logger } from '~/utils';

type TUseStepHandler = {
  announcePolite: (options: AnnounceOptions) => void;
  setMessages: (messages: TMessage[]) => void;
  getMessages: () => TMessage[] | undefined;
  /** @deprecated - isSubmitting should be derived from submission state */
  setIsSubmitting?: SetterOrUpdater<boolean>;
  lastAnnouncementTimeRef: React.MutableRefObject<number>;
};

type TStepEvent = {
  event: string;
  data:
    | Agents.MessageDeltaEvent
    | Agents.ReasoningDeltaEvent
    | Agents.RunStepDeltaEvent
    | Agents.AgentUpdate
    | Agents.RunStep
    | Agents.ToolEndEvent
    | {
        runId?: string;
        message: string;
      };
};

type MessageDeltaUpdate = { type: ContentTypes.TEXT; text: string; tool_call_ids?: string[] };

type ReasoningDeltaUpdate = { type: ContentTypes.THINK; think: string };

type AllContentTypes =
  | ContentTypes.TEXT
  | ContentTypes.THINK
  | ContentTypes.TOOL_CALL
  | ContentTypes.IMAGE_FILE
  | ContentTypes.IMAGE_URL
  | ContentTypes.ERROR;

export default function useStepHandler({
  setMessages,
  getMessages,
  announcePolite,
  lastAnnouncementTimeRef,
}: TUseStepHandler) {
  /** stepId -> array of tool call IDs (one per parallel tool in that step) */
  const toolCallIdMap = useRef(new Map<string, string[]>());
  const messageMap = useRef(new Map<string, TMessage>());
  const stepMap = useRef(new Map<string, Agents.RunStep>());
  /** Buffer for deltas that arrive before their corresponding run step */
  const pendingDeltaBuffer = useRef(new Map<string, TStepEvent[]>());

  /**
   * Calculate content index for a run step.
   * For edited content scenarios, offset by initialContent length.
   */
  const calculateContentIndex = useCallback(
    (
      serverIndex: number,
      initialContent: TMessageContentParts[],
      incomingContentType: string,
      existingContent?: TMessageContentParts[],
    ): number => {
      /** Only apply -1 adjustment for TEXT or THINK types when they match existing content */
      if (
        initialContent.length > 0 &&
        (incomingContentType === ContentTypes.TEXT || incomingContentType === ContentTypes.THINK)
      ) {
        const targetIndex = serverIndex + initialContent.length - 1;
        const existingType = existingContent?.[targetIndex]?.type;
        if (existingType === incomingContentType) {
          return targetIndex;
        }
      }
      return serverIndex + initialContent.length;
    },
    [],
  );

  /** Metadata to propagate onto content parts for parallel rendering - uses ContentMetadata from data-provider */

  const updateContent = (
    message: TMessage,
    index: number,
    contentPart: Agents.MessageContentComplex,
    finalUpdate = false,
    metadata?: ContentMetadata,
  ) => {
    const contentType = contentPart.type ?? '';
    if (!contentType) {
      console.warn('No content type found in content part');
      return message;
    }

    const updatedContent = [...(message.content || [])] as Array<
      Partial<TMessageContentParts> | undefined
    >;
    if (!updatedContent[index] && contentType !== ContentTypes.TOOL_CALL) {
      updatedContent[index] = { type: contentPart.type as AllContentTypes };
    }

    /** Prevent overwriting an existing content part with a different type */
    const existingType = (updatedContent[index]?.type as string | undefined) ?? '';
    if (
      existingType &&
      existingType !== contentType &&
      !contentType.startsWith(existingType) &&
      !existingType.startsWith(contentType)
    ) {
      console.warn('Content type mismatch', { existingType, contentType, index });
      return message;
    }

    if (
      contentType.startsWith(ContentTypes.TEXT) &&
      ContentTypes.TEXT in contentPart &&
      typeof contentPart.text === 'string'
    ) {
      const currentContent = updatedContent[index] as MessageDeltaUpdate;
      const update: MessageDeltaUpdate = {
        type: ContentTypes.TEXT,
        text: (currentContent.text || '') + contentPart.text,
      };

      if (contentPart.tool_call_ids != null) {
        update.tool_call_ids = contentPart.tool_call_ids;
      }
      updatedContent[index] = update;
    } else if (
      contentType.startsWith(ContentTypes.AGENT_UPDATE) &&
      ContentTypes.AGENT_UPDATE in contentPart &&
      contentPart.agent_update
    ) {
      const update: Agents.AgentUpdate = {
        type: ContentTypes.AGENT_UPDATE,
        agent_update: contentPart.agent_update,
      };

      updatedContent[index] = update;
    } else if (
      contentType.startsWith(ContentTypes.THINK) &&
      ContentTypes.THINK in contentPart &&
      typeof contentPart.think === 'string'
    ) {
      const currentContent = updatedContent[index] as ReasoningDeltaUpdate;
      const update: ReasoningDeltaUpdate = {
        type: ContentTypes.THINK,
        think: (currentContent.think || '') + contentPart.think,
      };

      updatedContent[index] = update;
    } else if (contentType === ContentTypes.IMAGE_URL && 'image_url' in contentPart) {
      const currentContent = updatedContent[index] as {
        type: ContentTypes.IMAGE_URL;
        image_url: string;
      };
      updatedContent[index] = {
        ...currentContent,
      };
    } else if (contentType === ContentTypes.TOOL_CALL && 'tool_call' in contentPart) {
      const existingContent = updatedContent[index] as Agents.ToolCallContent | undefined;
      const existingToolCall = existingContent?.tool_call;
      const toolCallArgs = (contentPart.tool_call as Agents.ToolCall).args;
      /** When args are a valid object, they are likely already invoked */
      let args =
        finalUpdate ||
        typeof existingToolCall?.args === 'object' ||
        typeof toolCallArgs === 'object'
          ? contentPart.tool_call.args
          : (existingToolCall?.args ?? '') + (toolCallArgs ?? '');
      /** Preserve previously streamed args when final update omits them */
      if (finalUpdate && args == null && existingToolCall?.args != null) {
        args = existingToolCall.args;
      }

      const id = getNonEmptyValue([contentPart.tool_call.id, existingToolCall?.id]) ?? '';
      const name = getNonEmptyValue([contentPart.tool_call.name, existingToolCall?.name]) ?? '';

      const newToolCall: Agents.ToolCall & PartMetadata = {
        id,
        name,
        args,
        type: ToolCallTypes.TOOL_CALL,
        auth: contentPart.tool_call.auth,
        expires_at: contentPart.tool_call.expires_at,
      };

      if (finalUpdate) {
        newToolCall.progress = 1;
        newToolCall.output = contentPart.tool_call.output;
      }

      updatedContent[index] = {
        type: ContentTypes.TOOL_CALL,
        tool_call: newToolCall,
      };
    }

    // Apply metadata to the content part for parallel rendering
    // This must happen AFTER all content updates to avoid being overwritten
    if (metadata?.agentId != null || metadata?.groupId != null) {
      const part = updatedContent[index] as TMessageContentParts & ContentMetadata;
      if (metadata.agentId != null) {
        part.agentId = metadata.agentId;
      }
      if (metadata.groupId != null) {
        part.groupId = metadata.groupId;
      }
    }

    return { ...message, content: updatedContent as TMessageContentParts[] };
  };

  /** Extract metadata from runStep for parallel content rendering */
  const getStepMetadata = (runStep: Agents.RunStep | undefined): ContentMetadata | undefined => {
    if (!runStep?.agentId && runStep?.groupId == null) {
      return undefined;
    }
    const metadata = {
      agentId: runStep.agentId,
      // Only set groupId when explicitly provided by the server
      // Sequential handoffs have agentId but no groupId
      // Parallel execution has both agentId AND groupId
      groupId: runStep.groupId,
    };
    return metadata;
  };

  const stepHandler = useCallback(
    ({ event, data }: TStepEvent, submission: EventSubmission) => {
      const messages = getMessages() || [];
      const { userMessage } = submission;
      let parentMessageId = userMessage.messageId;

      const currentTime = Date.now();
      if (currentTime - lastAnnouncementTimeRef.current > MESSAGE_UPDATE_INTERVAL) {
        announcePolite({ message: 'composing', isStatus: true });
        lastAnnouncementTimeRef.current = currentTime;
      }

      let initialContent: TMessageContentParts[] = [];
      // For editedContent scenarios, use the initial response content for index offsetting
      if (submission?.editedContent != null) {
        initialContent = submission?.initialResponse?.content ?? initialContent;
      }

      if (event === 'on_run_step') {
        const runStep = data as Agents.RunStep;
        let responseMessageId = runStep.runId ?? '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }
        if (!responseMessageId) {
          console.warn('No message id found in run step event');
          return;
        }

        stepMap.current.set(runStep.id, runStep);

        // Calculate content index - use server index, offset by initialContent for edit scenarios
        const contentIndex = runStep.index + initialContent.length;

        let response = messageMap.current.get(responseMessageId);

        if (!response) {
          // Find the actual response message - check if last message is a response, otherwise use initialResponse
          const lastMessage = messages[messages.length - 1] as TMessage;
          const responseMessage =
            lastMessage && !lastMessage.isCreatedByUser
              ? lastMessage
              : (submission?.initialResponse as TMessage);

          // For edit scenarios, initialContent IS the complete starting content (not to be merged)
          // For resume scenarios (no editedContent), initialContent is empty and we use existingContent
          const existingContent = responseMessage?.content ?? [];
          const mergedContent: TMessageContentParts[] =
            initialContent.length > 0 ? initialContent : existingContent;

          response = {
            ...responseMessage,
            parentMessageId,
            conversationId: userMessage.conversationId,
            messageId: responseMessageId,
            content: mergedContent,
          };

          messageMap.current.set(responseMessageId, response);

          // Get fresh messages to handle multi-tab scenarios where messages may have loaded
          // after this handler started (Tab 2 may have more complete history now)
          const freshMessages = getMessages() || [];
          const currentMessages = freshMessages.length > messages.length ? freshMessages : messages;

          // Remove any existing response placeholder
          let updatedMessages = currentMessages.filter((m) => m.messageId !== responseMessageId);

          // Ensure userMessage is present (multi-tab: Tab 2 may not have it yet)
          if (!updatedMessages.some((m) => m.messageId === userMessage.messageId)) {
            updatedMessages = [...updatedMessages, userMessage as TMessage];
          }

          setMessages([...updatedMessages, response]);
        }

        // Store tool call IDs if present (array for parallel tools)
        if (runStep.stepDetails.type === StepTypes.TOOL_CALLS) {
          let updatedResponse = { ...response };
          const toolCalls = runStep.stepDetails.tool_calls as Agents.ToolCall[];
          const toolCallIds = toolCalls
            .map((tc) => ('id' in tc && tc.id ? tc.id : ''))
            .filter(Boolean);
          if (toolCallIds.length > 0) {
            toolCallIdMap.current.set(runStep.id, toolCallIds);
          }
          toolCalls.forEach((toolCall, i) => {
            const toolCallId = toolCall.id ?? '';

            const contentPart: Agents.MessageContentComplex = {
              type: ContentTypes.TOOL_CALL,
              tool_call: {
                name: toolCall.name ?? '',
                args: toolCall.args,
                id: toolCallId,
              },
            };

            // Use contentIndex + i so each parallel tool gets its own content slot
            updatedResponse = updateContent(
              updatedResponse,
              contentIndex + i,
              contentPart,
              false,
              getStepMetadata(runStep),
            );
          });

          messageMap.current.set(responseMessageId, updatedResponse);
          const updatedMessages = messages.map((msg) =>
            msg.messageId === responseMessageId ? updatedResponse : msg,
          );

          setMessages(updatedMessages);
        }

        const bufferedDeltas = pendingDeltaBuffer.current.get(runStep.id);
        if (bufferedDeltas && bufferedDeltas.length > 0) {
          pendingDeltaBuffer.current.delete(runStep.id);
          for (const bufferedDelta of bufferedDeltas) {
            stepHandler({ event: bufferedDelta.event, data: bufferedDelta.data }, submission);
          }
        }
      } else if (event === 'on_agent_update') {
        const { agent_update } = data as Agents.AgentUpdate;
        let responseMessageId = agent_update.runId || '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }
        if (!responseMessageId) {
          console.warn('No message id found in agent update event');
          return;
        }

        const response = messageMap.current.get(responseMessageId);
        if (response) {
          // Agent updates don't need index adjustment
          const currentIndex = agent_update.index + initialContent.length;
          // Agent updates carry their own agentId - use default groupId if agentId is present
          const agentUpdateMeta: ContentMetadata | undefined = agent_update.agentId
            ? { agentId: agent_update.agentId, groupId: 1 }
            : undefined;
          const updatedResponse = updateContent(
            response,
            currentIndex,
            data,
            false,
            agentUpdateMeta,
          );
          messageMap.current.set(responseMessageId, updatedResponse);
          const currentMessages = getMessages() || [];
          setMessages([...currentMessages.slice(0, -1), updatedResponse]);
        }
      } else if (event === 'on_message_delta') {
        const messageDelta = data as Agents.MessageDeltaEvent;
        const runStep = stepMap.current.get(messageDelta.id);
        let responseMessageId = runStep?.runId ?? '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }

        if (!runStep || !responseMessageId) {
          const buffer = pendingDeltaBuffer.current.get(messageDelta.id) ?? [];
          buffer.push({ event: 'on_message_delta', data: messageDelta });
          pendingDeltaBuffer.current.set(messageDelta.id, buffer);
          return;
        }

        const response = messageMap.current.get(responseMessageId);
        if (response && messageDelta.delta.content) {
          const contentPart = Array.isArray(messageDelta.delta.content)
            ? messageDelta.delta.content[0]
            : messageDelta.delta.content;

          if (contentPart == null) {
            return;
          }

          const currentIndex = calculateContentIndex(
            runStep.index,
            initialContent,
            contentPart.type || '',
            response.content,
          );
          const updatedResponse = updateContent(
            response,
            currentIndex,
            contentPart,
            false,
            getStepMetadata(runStep),
          );
          messageMap.current.set(responseMessageId, updatedResponse);
          const currentMessages = getMessages() || [];
          setMessages([...currentMessages.slice(0, -1), updatedResponse]);
        }
      } else if (event === 'on_reasoning_delta') {
        const reasoningDelta = data as Agents.ReasoningDeltaEvent;
        const runStep = stepMap.current.get(reasoningDelta.id);
        let responseMessageId = runStep?.runId ?? '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }

        if (!runStep || !responseMessageId) {
          const buffer = pendingDeltaBuffer.current.get(reasoningDelta.id) ?? [];
          buffer.push({ event: 'on_reasoning_delta', data: reasoningDelta });
          pendingDeltaBuffer.current.set(reasoningDelta.id, buffer);
          return;
        }

        const response = messageMap.current.get(responseMessageId);
        if (response && reasoningDelta.delta.content != null) {
          const contentPart = Array.isArray(reasoningDelta.delta.content)
            ? reasoningDelta.delta.content[0]
            : reasoningDelta.delta.content;

          if (contentPart == null) {
            return;
          }

          const currentIndex = calculateContentIndex(
            runStep.index,
            initialContent,
            contentPart.type || '',
            response.content,
          );
          const updatedResponse = updateContent(
            response,
            currentIndex,
            contentPart,
            false,
            getStepMetadata(runStep),
          );
          messageMap.current.set(responseMessageId, updatedResponse);
          const currentMessages = getMessages() || [];
          setMessages([...currentMessages.slice(0, -1), updatedResponse]);
        }
      } else if (event === 'on_run_step_delta') {
        const runStepDelta = data as Agents.RunStepDeltaEvent;
        const runStep = stepMap.current.get(runStepDelta.id);
        let responseMessageId = runStep?.runId ?? '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }

        if (!runStep || !responseMessageId) {
          // Fallback: when delta has auth but step is missing, try to merge auth into a matching tool call
          if (
            runStepDelta.delta?.auth != null &&
            runStepDelta.delta?.tool_calls?.length &&
            runStepDelta.delta.type === StepTypes.TOOL_CALLS
          ) {
            const fallbackMessageId =
              responseMessageId ||
              submission?.initialResponse?.messageId ||
              messages.find((m) => !m.isCreatedByUser)?.messageId;
            if (fallbackMessageId) {
              const response =
                messageMap.current.get(fallbackMessageId) ??
                messages.find((m) => m.messageId === fallbackMessageId);
              const content = response?.content ?? [];
              const toolName = runStepDelta.delta.tool_calls[0]?.name;
              const contentIndex = content.findIndex(
                (part) =>
                  part?.type === ContentTypes.TOOL_CALL &&
                  (part as { tool_call?: { name?: string } })?.tool_call?.name === toolName &&
                  !(part as { tool_call?: { auth?: string } })?.tool_call?.auth,
              );
              if (contentIndex >= 0) {
                logger.debug('[MCP OAuth] on_run_step_delta: applying auth via fallback (no step)', {
                  stepId: runStepDelta.id,
                  toolName,
                  contentIndex,
                });
                const existingPart = content[contentIndex] as { tool_call?: Record<string, unknown> };
                const updatedContent = [...content];
                updatedContent[contentIndex] = {
                  ...existingPart,
                  tool_call: {
                    ...existingPart?.tool_call,
                    auth: runStepDelta.delta.auth,
                    expires_at: runStepDelta.delta.expires_at,
                  },
                };
                const updatedResponse = { ...response, content: updatedContent };
                messageMap.current.set(fallbackMessageId, updatedResponse);
                const updatedMessages = messages.map((msg) =>
                  msg.messageId === fallbackMessageId ? updatedResponse : msg,
                );
                setMessages(updatedMessages);
                return;
              }
            }
          }
          logger.debug('[MCP OAuth] on_run_step_delta: buffering (step or responseMessageId missing)', {
            stepId: runStepDelta.id,
            hasRunStep: !!runStep,
            responseMessageId: responseMessageId || 'empty',
            hasAuth: runStepDelta.delta?.auth != null,
          });
          const buffer = pendingDeltaBuffer.current.get(runStepDelta.id) ?? [];
          buffer.push({ event: 'on_run_step_delta', data: runStepDelta });
          pendingDeltaBuffer.current.set(runStepDelta.id, buffer);
          return;
        }

        logger.debug('[MCP OAuth] on_run_step_delta: processing', {
          stepId: runStepDelta.id,
          responseMessageId,
          hasAuth: runStepDelta.delta?.auth != null,
        });

        const response = messageMap.current.get(responseMessageId);
        if (
          response &&
          runStepDelta.delta.type === StepTypes.TOOL_CALLS &&
          runStepDelta.delta.tool_calls
        ) {
          let updatedResponse = { ...response };
          const toolCallIds = toolCallIdMap.current.get(runStepDelta.id) ?? [];

          runStepDelta.delta.tool_calls.forEach((toolCallDelta, i) => {
            const explicitIndex = (toolCallDelta as { index?: number }).index;
            const deltaIndex =
              typeof explicitIndex === 'number' ? explicitIndex : i;
            const toolCallId = toolCallIds[deltaIndex] ?? toolCallIds[0] ?? '';

            const contentPart: Agents.MessageContentComplex = {
              type: ContentTypes.TOOL_CALL,
              tool_call: {
                name: toolCallDelta.name ?? '',
                args: toolCallDelta.args ?? '',
                id: toolCallId,
              },
            };

            if (runStepDelta.delta.auth != null) {
              contentPart.tool_call.auth = runStepDelta.delta.auth;
              contentPart.tool_call.expires_at = runStepDelta.delta.expires_at;
            }

            // Use delta index when present for parallel tools; fallback to runStep.index
            const currentIndex =
              runStep.index + initialContent.length + deltaIndex;
            updatedResponse = updateContent(
              updatedResponse,
              currentIndex,
              contentPart,
              false,
              getStepMetadata(runStep),
            );
          });

          messageMap.current.set(responseMessageId, updatedResponse);
          const updatedMessages = messages.map((msg) =>
            msg.messageId === responseMessageId ? updatedResponse : msg,
          );

          setMessages(updatedMessages);
        }
      } else if (event === 'on_run_step_completed') {
        const { result } = data as unknown as { result: Agents.ToolEndEvent };
        const { id: stepId, index: resultIndex, tool_call: toolCallResult } = result;

        if (!toolCallResult) {
          return;
        }

        const runStep = stepMap.current.get(stepId);
        let responseMessageId = runStep?.runId ?? '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }

        // Fallback when step not in map (e.g. reconnection, event ordering): use result.index
        // and find response message from initialResponse or last assistant message
        if (!responseMessageId) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          if (!responseMessageId) {
            const lastAssistant = [...messages].reverse().find((m) => !m.isCreatedByUser);
            responseMessageId = lastAssistant?.messageId ?? '';
          }
        }

        let response = messageMap.current.get(responseMessageId);
        if (!response) {
          const responseMessage =
            messages.find((m) => m.messageId === responseMessageId) ??
            (submission?.initialResponse?.messageId === responseMessageId
              ? (submission.initialResponse as TMessage)
              : null);
          if (responseMessage) {
            response = {
              ...responseMessage,
              parentMessageId: responseMessage.parentMessageId ?? userMessage.messageId,
              conversationId: responseMessage.conversationId ?? userMessage.conversationId,
              messageId: responseMessageId,
              content: responseMessage.content ?? [],
            };
            messageMap.current.set(responseMessageId, response);
          }
        }

        if (!response) {
          return;
        }

        // Resolve content index: prefer tool_call.id; fallback to name+args; then resultIndex; then runStep.index
        // (backend may send wrong index for parallel tools, so matching by id is most reliable)
        let currentIndex: number;
        const toolCallId = toolCallResult.id ?? '';
        const content = response.content ?? [];
        const getToolCall = (p: TMessageContentParts) =>
          (p?.type === ContentTypes.TOOL_CALL
            ? (p.tool_call ?? (p[ContentTypes.TOOL_CALL] as Agents.ToolCall))
            : undefined) as Agents.ToolCall | undefined;

        let indexById = toolCallId
          ? content.findIndex(
              (p) =>
                p?.type === ContentTypes.TOOL_CALL && getToolCall(p)?.id === toolCallId,
            )
          : -1;
        if (indexById < 0 && toolCallResult.name) {
          const toolCallsWithName = content
            .map((p, i) => (p?.type === ContentTypes.TOOL_CALL ? { p, i } : null))
            .filter(
              (v): v is { p: TMessageContentParts; i: number } =>
                v != null && getToolCall(v.p)?.name === toolCallResult.name,
            );
          const withoutOutput = toolCallsWithName.filter(
            (v) => !getToolCall(v.p)?.output,
          );
          if (withoutOutput.length === 1) {
            indexById = withoutOutput[0].i;
          } else if (toolCallsWithName.length === 1) {
            indexById = toolCallsWithName[0].i;
          }
        }
        if (indexById >= 0) {
          currentIndex = indexById;
        } else if (typeof resultIndex === 'number' && resultIndex >= 0) {
          if (indexById < 0 && toolCallId) {
            console.warn('[useStepHandler] on_run_step_completed: indexById not found, using resultIndex', {
              toolCallId,
              resultIndex,
              stepId,
            });
          }
          currentIndex = resultIndex + initialContent.length;
        } else if (runStep != null) {
          currentIndex = runStep.index + initialContent.length;
        } else {
          const pendingCalls = content
            .map((p, i) =>
              p?.type === ContentTypes.TOOL_CALL && !getToolCall(p)?.output
                ? { p, i }
                : null,
            )
            .filter(
              (v): v is { p: TMessageContentParts; i: number } =>
                v != null &&
                (toolCallResult.name == null ||
                  getToolCall(v.p)?.name === toolCallResult.name),
            );
          if (pendingCalls.length === 1) {
            currentIndex = pendingCalls[0].i;
          } else {
            const isToolSearch =
              toolCallResult.name === 'tool_search' ||
              (typeof toolCallResult.name === 'string' && toolCallResult.name.startsWith('tool_search_mcp_'));
            const hasOutput = toolCallResult.output != null && toolCallResult.output !== '';
            const toolCallsWithoutOutputIndices = content
              .map((p, i) =>
                p?.type === ContentTypes.TOOL_CALL && !getToolCall(p)?.output
                  ? { i, tc: getToolCall(p) }
                  : null,
              )
              .filter((v): v is { i: number; tc: Agents.ToolCall } => v != null);
            const toolSearchMatches = toolCallsWithoutOutputIndices.filter(
              (v) =>
                v.tc?.name === 'tool_search' ||
                (typeof v.tc?.name === 'string' && v.tc.name.startsWith('tool_search_mcp_')),
            );
            if (isToolSearch && hasOutput) {
              if (toolSearchMatches.length === 1) {
                currentIndex = toolSearchMatches[0].i;
              } else if (
                toolSearchMatches.length > 1 &&
                toolCallResult.name &&
                toolSearchMatches.some((m) => m.tc?.name === toolCallResult.name)
              ) {
                const exact = toolSearchMatches.find(
                  (m) => m.tc?.name === toolCallResult.name,
                );
                currentIndex = exact ? exact.i : toolSearchMatches[0].i;
              } else if (toolSearchMatches.length > 0) {
                currentIndex = toolSearchMatches[0].i;
                console.warn('[useStepHandler] on_run_step_completed: ambiguous tool_search, using first match', {
                  stepId,
                  toolName: toolCallResult.name,
                  toolSearchMatchesCount: toolSearchMatches.length,
                });
              } else {
                const firstWithoutOutput = toolCallsWithoutOutputIndices[0];
                if (firstWithoutOutput) {
                  currentIndex = firstWithoutOutput.i;
                  console.warn('[useStepHandler] on_run_step_completed: no tool_search match, applying to first tool without output', {
                    stepId,
                    toolName: toolCallResult.name,
                    fallbackIndex: firstWithoutOutput.i,
                  });
                } else {
                  console.warn('[useStepHandler] on_run_step_completed: index resolution failed', {
                    stepId,
                    resultIndex,
                    toolCallId,
                    toolName: toolCallResult.name,
                    contentLength: content.length,
                    toolCallIndicesInContent: content
                      .map((p, i) =>
                        p?.type === ContentTypes.TOOL_CALL
                          ? { i, name: getToolCall(p)?.name, hasOutput: !!getToolCall(p)?.output }
                          : null,
                      )
                      .filter(Boolean),
                  });
                  return;
                }
              }
            } else {
              const firstMatch = pendingCalls[0] ?? toolCallsWithoutOutputIndices[0];
              if (firstMatch) {
                currentIndex = firstMatch.i;
                console.warn('[useStepHandler] on_run_step_completed: using first tool without output as fallback', {
                  stepId,
                  toolName: toolCallResult.name,
                  fallbackIndex: firstMatch.i,
                });
              } else {
                console.warn('[useStepHandler] on_run_step_completed: index resolution failed', {
                  stepId,
                  resultIndex,
                  toolCallId,
                  toolName: toolCallResult.name,
                  contentLength: content.length,
                  pendingCallsCount: pendingCalls.length,
                  toolCallIndicesInContent: content
                    .map((p, i) =>
                      p?.type === ContentTypes.TOOL_CALL
                        ? { i, name: getToolCall(p)?.name, hasOutput: !!getToolCall(p)?.output }
                        : null,
                    )
                    .filter(Boolean),
                });
                return;
              }
            }
          }
        }

        if (response) {
          const updatedResponse = updateContent(
            { ...response },
            currentIndex,
            {
              type: ContentTypes.TOOL_CALL,
              tool_call: toolCallResult,
            },
            true,
            runStep != null ? getStepMetadata(runStep) : undefined,
          );

          messageMap.current.set(responseMessageId, updatedResponse);
          const updatedMessages = messages.map((msg) =>
            msg.messageId === responseMessageId ? updatedResponse : msg,
          );

          setMessages(updatedMessages);
        }
      }

      return () => {
        toolCallIdMap.current.clear();
        messageMap.current.clear();
        stepMap.current.clear();
      };
    },
    [
      getMessages,
      lastAnnouncementTimeRef,
      announcePolite,
      setMessages,
      calculateContentIndex,
    ],
  );

  const clearStepMaps = useCallback(() => {
    toolCallIdMap.current.clear();
    messageMap.current.clear();
    stepMap.current.clear();
    pendingDeltaBuffer.current.clear();
  }, []);

  /**
   * Sync a message into the step handler's messageMap.
   * Call this after receiving sync event to ensure subsequent deltas
   * build on the synced content, not stale content.
   */
  const syncStepMessage = useCallback((message: TMessage) => {
    if (message?.messageId) {
      messageMap.current.set(message.messageId, { ...message });
    }
  }, []);

  return { stepHandler, clearStepMaps, syncStepMessage };
}
