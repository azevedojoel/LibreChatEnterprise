import { memo, useMemo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ContentTypes,
  ToolCallTypes,
  Tools,
  Constants,
  imageGenTools,
} from 'librechat-data-provider';
import type {
  TMessageContentParts,
  SearchResultData,
  TAttachment,
  Agents,
} from 'librechat-data-provider';
import { MessageContext, SearchContext } from '~/Providers';
import { useGetStartupConfig } from '~/data-provider';
import { ParallelContentRenderer, type PartWithIndex } from './ParallelContent';
import { mapAttachments } from '~/utils';
import { EditTextPart, EmptyText } from './Parts';
import MemoryArtifacts from './MemoryArtifacts';
import Sources from '~/components/Web/Sources';
import Container from './Container';
import Part from './Part';

const HIDE_COMPLETED_GRACE_MS = 800;

export function isCompletedGenericToolCall(part: TMessageContentParts | undefined): boolean {
  if (!part || part.type !== ContentTypes.TOOL_CALL) {
    return false;
  }
  const tc = (part as { tool_call?: Record<string, unknown> }).tool_call;
  if (!tc) {
    return false;
  }
  const progress = (tc.progress as number) ?? 0;
  const hasOutput = tc.output != null && tc.output !== '';
  if (progress < 1 && !hasOutput) {
    return false;
  }
  // Exclude non-generic tool calls (ExecuteCode, WebSearch, OpenAIImageGen, etc.)
  const name = (tc.name as string) ?? (tc.function as { name?: string })?.name ?? '';
  if (
    name === Tools.execute_code ||
    name === Constants.PROGRAMMATIC_TOOL_CALLING ||
    name === 'image_gen_oai' ||
    name === 'image_edit_oai' ||
    name === 'gemini_image_gen' ||
    name === Tools.web_search ||
    (typeof name === 'string' && name.startsWith(Constants.LC_TRANSFER_TO_))
  ) {
    return false;
  }
  const tcType = tc.type as string | undefined;
  if (
    tcType === ToolCallTypes.CODE_INTERPRETER ||
    tcType === ToolCallTypes.RETRIEVAL ||
    tcType === ToolCallTypes.FILE_SEARCH
  ) {
    return false;
  }
  if (
    tcType === ToolCallTypes.FUNCTION &&
    ToolCallTypes.FUNCTION in tc &&
    (tc.function as { name?: string })?.name
  ) {
    const funcName = (tc.function as { name: string }).name;
    if (imageGenTools.has(funcName)) {
      return false;
    }
  }
  return true;
}

type ContentPartsProps = {
  content: Array<TMessageContentParts | undefined> | undefined;
  messageId: string;
  conversationId?: string | null;
  attachments?: TAttachment[];
  searchResults?: { [key: string]: SearchResultData };
  isCreatedByUser: boolean;
  isLast: boolean;
  isSubmitting: boolean;
  isLatestMessage?: boolean;
  edit?: boolean;
  enterEdit?: (cancel?: boolean) => void | null | undefined;
  siblingIdx?: number;
  setSiblingIdx?:
    | ((value: number) => void | React.Dispatch<React.SetStateAction<number>>)
    | null
    | undefined;
};

/**
 * ContentParts renders message content parts, handling both sequential and parallel layouts.
 *
 * For 90% of messages (single-agent, no parallel execution), this renders sequentially.
 * For multi-agent parallel execution, it uses ParallelContentRenderer to show columns.
 */
const ContentParts = memo(function ContentParts({
  edit,
  isLast,
  content,
  messageId,
  enterEdit,
  siblingIdx,
  attachments,
  isSubmitting,
  setSiblingIdx,
  searchResults,
  conversationId,
  isCreatedByUser,
  isLatestMessage,
}: ContentPartsProps) {
  const attachmentMap = useMemo(() => mapAttachments(attachments ?? []), [attachments]);
  const effectiveIsSubmitting = isLatestMessage ? isSubmitting : false;
  const { data: startupConfig } = useGetStartupConfig();
  const hideCompletedToolCalls =
    (startupConfig?.interface as { hideCompletedToolCalls?: boolean } | undefined)
      ?.hideCompletedToolCalls ?? false;

  const prevEffectiveIsSubmittingRef = useRef(effectiveIsSubmitting);
  const [gracePeriodActive, setGracePeriodActive] = useState(false);

  useEffect(() => {
    if (!hideCompletedToolCalls || !isLatestMessage) {
      setGracePeriodActive(false);
      prevEffectiveIsSubmittingRef.current = effectiveIsSubmitting;
      return;
    }
    const wasSubmitting = prevEffectiveIsSubmittingRef.current;
    prevEffectiveIsSubmittingRef.current = effectiveIsSubmitting;
    if (wasSubmitting && !effectiveIsSubmitting) {
      setGracePeriodActive(true);
      const t = setTimeout(() => setGracePeriodActive(false), HIDE_COMPLETED_GRACE_MS);
      return () => clearTimeout(t);
    }
  }, [hideCompletedToolCalls, isLatestMessage, effectiveIsSubmitting]);

  const shouldFilterCompletedToolCalls =
    hideCompletedToolCalls && !effectiveIsSubmitting && !gracePeriodActive;

  const shouldShowPart = useCallback(
    (part: TMessageContentParts | undefined): boolean => {
      if (!part) return false;
      if (!shouldFilterCompletedToolCalls) return true;
      return !isCompletedGenericToolCall(part);
    },
    [shouldFilterCompletedToolCalls],
  );

  /**
   * Render a single content part with proper context.
   */
  const renderPart = useCallback(
    (
      part: TMessageContentParts,
      idx: number,
      isLastPart: boolean,
      displayContentForNextType: Array<TMessageContentParts | undefined>,
    ) => {
      const toolCallId = (part?.[ContentTypes.TOOL_CALL] as Agents.ToolCall | undefined)?.id ?? '';
      const partAttachments = attachmentMap[toolCallId];

      return (
        <MessageContext.Provider
          key={`provider-${messageId}-${idx}`}
          value={{
            messageId,
            isExpanded: true,
            conversationId,
            partIndex: idx,
            nextType: displayContentForNextType?.[idx + 1]?.type,
            isSubmitting: effectiveIsSubmitting,
            isLatestMessage,
          }}
        >
          <Part
            part={part}
            attachments={partAttachments}
            isSubmitting={effectiveIsSubmitting}
            key={`part-${messageId}-${idx}`}
            isCreatedByUser={isCreatedByUser}
            isLast={isLastPart}
            showCursor={isLastPart && isLast}
            hideCompletedToolCalls={hideCompletedToolCalls}
          />
        </MessageContext.Provider>
      );
    },
    [
      attachmentMap,
      conversationId,
      effectiveIsSubmitting,
      isCreatedByUser,
      isLast,
      isLatestMessage,
      messageId,
      hideCompletedToolCalls,
    ],
  );

  // Early return: no content
  if (!content) {
    return null;
  }

  // Edit mode: render editable text parts
  if (edit === true && enterEdit && setSiblingIdx) {
    return (
      <>
        {content.map((part, idx) => {
          if (!part) {
            return null;
          }
          const isTextPart =
            part?.type === ContentTypes.TEXT ||
            typeof (part as unknown as Agents.MessageContentText)?.text !== 'string';
          const isThinkPart =
            part?.type === ContentTypes.THINK ||
            typeof (part as unknown as Agents.ReasoningDeltaUpdate)?.think !== 'string';
          if (!isTextPart && !isThinkPart) {
            return null;
          }

          const isToolCall = part.type === ContentTypes.TOOL_CALL || part['tool_call_ids'] != null;
          if (isToolCall) {
            return null;
          }

          return (
            <EditTextPart
              index={idx}
              part={part as Agents.MessageContentText | Agents.ReasoningDeltaUpdate}
              messageId={messageId}
              isSubmitting={isSubmitting}
              enterEdit={enterEdit}
              siblingIdx={siblingIdx ?? null}
              setSiblingIdx={setSiblingIdx}
              key={`edit-${messageId}-${idx}`}
            />
          );
        })}
      </>
    );
  }

  const displayContent = useMemo(
    () =>
      content?.filter((part): part is TMessageContentParts => !!part && shouldShowPart(part)) ?? [],
    [content, shouldShowPart],
  );

  const showEmptyCursor = displayContent.length === 0 && effectiveIsSubmitting;
  const lastContentIdx = displayContent.length - 1;

  // Parallel content: use dedicated renderer with columns (TMessageContentParts includes ContentMetadata)
  const hasParallelContent = displayContent.some((part) => part?.groupId != null);
  if (hasParallelContent) {
    const boundRenderPart = useCallback(
      (part: TMessageContentParts, idx: number, isLastPart: boolean) =>
        renderPart(part, idx, isLastPart, displayContent),
      [renderPart, displayContent],
    );
    return (
      <ParallelContentRenderer
        content={displayContent}
        messageId={messageId}
        conversationId={conversationId}
        attachments={attachments}
        searchResults={searchResults}
        isSubmitting={effectiveIsSubmitting}
        renderPart={boundRenderPart}
      />
    );
  }

  // Sequential content: render parts in order (90% of cases)
  const sequentialParts: PartWithIndex[] = displayContent.map((part, idx) => ({ part, idx }));

  return (
    <SearchContext.Provider value={{ searchResults }}>
      <MemoryArtifacts attachments={attachments} />
      <Sources messageId={messageId} conversationId={conversationId || undefined} />
      {showEmptyCursor && (
        <Container>
          <EmptyText />
        </Container>
      )}
      {sequentialParts.map(({ part, idx }) =>
        renderPart(part, idx, idx === lastContentIdx, displayContent),
      )}
    </SearchContext.Provider>
  );
});

export default ContentParts;
