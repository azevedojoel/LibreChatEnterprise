import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useProgress } from '~/hooks';
import { parseCRMSingleOutput } from '~/utils/parseToolOutput';
import ToolResultContainer from './ToolResultContainer';

const CRM_ICON = (
  <svg
    className="size-5 shrink-0 text-text-secondary"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
    />
  </svg>
);

type CRMLogActivityProps = {
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
};

export default function CRMLogActivity({
  output,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
}: CRMLogActivityProps) {
  const { conversationId, messageId } = useMessageContext();
  const expandedToolCalls = useRecoilValue(store.expandedToolCallsAtom);
  const setExpandedToolCalls = useSetRecoilState(store.expandedToolCallsAtom);
  const [localExpanded, setLocalExpanded] = useState(false);

  const expandedKey =
    conversationId && messageId && toolCallId
      ? `${conversationId}:${messageId}:${toolCallId}`
      : null;

  const isExpanded = expandedKey ? expandedToolCalls.has(expandedKey) : localExpanded;

  const toggleExpand = useCallback(() => {
    if (expandedKey) {
      setExpandedToolCalls((prev) => {
        const next = new Set(prev);
        if (next.has(expandedKey)) next.delete(expandedKey);
        else next.add(expandedKey);
        return next;
      });
    } else {
      setLocalExpanded((prev) => !prev);
    }
  }, [expandedKey, setExpandedToolCalls]);

  const progress = useProgress(initialProgress);
  const hasOutput = output != null && output !== '';
  const error =
    typeof output === 'string' && output.toLowerCase().includes('error processing tool');
  const cancelled = !hasOutput && !isSubmitting && progress < 1;
  const isLoading = isSubmitting && !hasOutput;

  const parsed = useMemo(() => parseCRMSingleOutput(output), [output]);
  const item = parsed?.item;
  const outputError = parsed?.error;

  const summary = outputError ? 'Failed to log activity' : 'Logged activity';
  const hasError = error || cancelled || !!outputError;

  if (!isLast && !hasOutput && !output) {
    return null;
  }

  return (
    <ToolResultContainer
      icon={CRM_ICON}
      summary={summary}
      isExpanded={isExpanded}
      onToggle={toggleExpand}
      isLoading={isLoading}
      error={hasError}
      hasExpandableContent={!!item || hasOutput}
    >
      {outputError ? (
        <p className="text-sm text-red-500">{outputError}</p>
      ) : item ? (
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <span className="text-text-secondary">-</span>
            <span className="min-w-0 flex-1 text-text-primary">
              {(item.summary as string) ?? (item.type as string) ?? 'Activity logged'}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-text-secondary">Activity logged successfully.</p>
      )}
    </ToolResultContainer>
  );
}
