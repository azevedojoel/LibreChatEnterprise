import { Suspense, useMemo, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { DelayedRender } from '@librechat/client';
import { ContentTypes } from 'librechat-data-provider';
import type {
  Agents,
  TMessage,
  TAttachment,
  SearchResultData,
  TMessageContentParts,
} from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import { UnfinishedMessage } from './MessageContent';
import Sources from '~/components/Web/Sources';
import { cn, mapAttachments } from '~/utils';
import { SearchContext } from '~/Providers';
import MarkdownLite from './MarkdownLite';
import store from '~/store';
import Part from './Part';
import { isCompletedGenericToolCall } from './ContentParts';

const SearchContent = ({
  message,
  attachments,
  searchResults,
}: {
  message: TMessage;
  attachments?: TAttachment[];
  searchResults?: { [key: string]: SearchResultData };
}) => {
  const enableUserMsgMarkdown = useRecoilValue(store.enableUserMsgMarkdown);
  const { messageId } = message;
  const { data: startupConfig } = useGetStartupConfig();
  const hideCompletedToolCalls =
    (startupConfig?.interface as { hideCompletedToolCalls?: boolean } | undefined)
      ?.hideCompletedToolCalls ?? false;

  const attachmentMap = useMemo(() => mapAttachments(attachments ?? []), [attachments]);

  const shouldShowPart = useCallback(
    (part: TMessageContentParts | undefined) => {
      if (!part) return false;
      if (!hideCompletedToolCalls) return true;
      return !isCompletedGenericToolCall(part);
    },
    [hideCompletedToolCalls],
  );

  if (Array.isArray(message.content) && message.content.length > 0) {
    const displayContent = message.content.filter(
      (part): part is TMessageContentParts => !!part && shouldShowPart(part),
    );
    return (
      <SearchContext.Provider value={{ searchResults }}>
        <Sources />
        {displayContent.map((part: TMessageContentParts, idx: number) => {
            const toolCallId =
              (part?.[ContentTypes.TOOL_CALL] as Agents.ToolCall | undefined)?.id ?? '';
            const attachments = attachmentMap[toolCallId];
            return (
              <Part
                key={`display-${messageId}-${idx}`}
                showCursor={false}
                isSubmitting={false}
                isCreatedByUser={message.isCreatedByUser}
                attachments={attachments}
                part={part}
                hideCompletedToolCalls={hideCompletedToolCalls}
              />
            );
          })}
        {message.unfinished === true && (
          <Suspense>
            <DelayedRender delay={250}>
              <UnfinishedMessage message={message} key={`unfinished-${messageId}`} />
            </DelayedRender>
          </Suspense>
        )}
      </SearchContext.Provider>
    );
  }

  return (
    <div
      className={cn(
        'markdown prose dark:prose-invert light w-full break-words',
        message.isCreatedByUser && !enableUserMsgMarkdown && 'whitespace-pre-wrap',
        message.isCreatedByUser ? 'dark:text-gray-20' : 'dark:text-gray-70',
      )}
      dir="auto"
    >
      <MarkdownLite content={message.text || ''} />
    </div>
  );
};

export default SearchContent;
