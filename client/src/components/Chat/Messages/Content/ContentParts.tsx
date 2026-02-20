import { memo, useMemo, useCallback } from 'react';
import { ContentTypes, Constants } from 'librechat-data-provider';
import type {
  TMessageContentParts,
  SearchResultData,
  TAttachment,
  Agents,
} from 'librechat-data-provider';
import { MessageContext, SearchContext } from '~/Providers';
import { ParallelContentRenderer, type PartWithIndex } from './ParallelContent';
import { mapAttachments } from '~/utils';
import { EditTextPart, EmptyText } from './Parts';
import MemoryArtifacts from './MemoryArtifacts';
import Sources from '~/components/Web/Sources';
import Container from './Container';
import Part from './Part';

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

  /** Extract MCP server name from a tool call part that has auth (for deduplicating auth buttons) */
  const getAuthServerFromPart = useCallback((p: TMessageContentParts | undefined): string | null => {
    if (!p || p.type !== ContentTypes.TOOL_CALL) return null;
    const tc = (p as { tool_call?: Agents.ToolCall }).tool_call ?? (p as Record<string, unknown>)[ContentTypes.TOOL_CALL] as Agents.ToolCall | undefined;
    if (!tc?.auth) return null;
    const toolName = tc.name ?? '';
    if (typeof toolName === 'string' && toolName.includes(Constants.mcp_delimiter)) {
      return toolName.split(Constants.mcp_delimiter).pop() ?? null;
    }
    try {
      const url = new URL(tc.auth);
      const redirectUri = url.searchParams.get('redirect_uri') || '';
      const match = redirectUri.match(/\/api\/mcp\/([^/]+)\/oauth\/callback/);
      return match?.[1] ?? null;
    } catch {
      return null;
    }
  }, []);

  /**
   * Render a single content part with proper context.
   */
  const renderPart = useCallback(
    (part: TMessageContentParts, idx: number, isLastPart: boolean) => {
      const toolCallId = (part?.[ContentTypes.TOOL_CALL] as Agents.ToolCall | undefined)?.id ?? '';
      const partAttachments = attachmentMap[toolCallId];

      const currentServer = getAuthServerFromPart(part);
      const priorHasSameServer =
        currentServer != null &&
        content
          .slice(0, idx)
          .some((p) => getAuthServerFromPart(p) === currentServer);
      const showAuthButton = currentServer == null || !priorHasSameServer;

      return (
        <MessageContext.Provider
          key={`provider-${messageId}-${idx}`}
          value={{
            messageId,
            isExpanded: true,
            conversationId,
            partIndex: idx,
            nextType: content?.[idx + 1]?.type,
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
            showAuthButton={showAuthButton}
          />
        </MessageContext.Provider>
      );
    },
    [
      attachmentMap,
      content,
      conversationId,
      effectiveIsSubmitting,
      getAuthServerFromPart,
      isCreatedByUser,
      isLast,
      isLatestMessage,
      messageId,
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

  const showEmptyCursor = content.length === 0 && effectiveIsSubmitting;
  const lastContentIdx = content.length - 1;

  // Parallel content: use dedicated renderer with columns (TMessageContentParts includes ContentMetadata)
  const hasParallelContent = content.some((part) => part?.groupId != null);
  if (hasParallelContent) {
    return (
      <ParallelContentRenderer
        content={content}
        messageId={messageId}
        conversationId={conversationId}
        attachments={attachments}
        searchResults={searchResults}
        isSubmitting={effectiveIsSubmitting}
        renderPart={renderPart}
      />
    );
  }

  // Sequential content: render parts in order (90% of cases)
  const sequentialParts: PartWithIndex[] = [];
  content.forEach((part, idx) => {
    if (part) {
      sequentialParts.push({ part, idx });
    }
  });

  return (
    <SearchContext.Provider value={{ searchResults }}>
      <MemoryArtifacts attachments={attachments} />
      <Sources messageId={messageId} conversationId={conversationId || undefined} />
      {showEmptyCursor && (
        <Container>
          <EmptyText />
        </Container>
      )}
      {sequentialParts.map(({ part, idx }) => renderPart(part, idx, idx === lastContentIdx))}
    </SearchContext.Provider>
  );
});

export default ContentParts;
