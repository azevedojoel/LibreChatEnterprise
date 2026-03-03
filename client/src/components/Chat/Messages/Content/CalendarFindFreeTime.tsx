import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useProgress } from '~/hooks';
import { formatDate } from '~/utils';
import { parseCalendarFindFreeTimeOutput } from '~/utils/parseToolOutput';
import ToolResultContainer from './ToolResultContainer';

const CALENDAR_ICON = '/assets/google.svg';

type CalendarFindFreeTimeProps = {
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
};

function formatSlotTime(iso?: string): string {
  if (!iso) return '';
  try {
    return formatDate(iso);
  } catch {
    return iso;
  }
}

export default function CalendarFindFreeTime({
  output,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
}: CalendarFindFreeTimeProps) {
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

  const parsed = useMemo(() => parseCalendarFindFreeTimeOutput(output), [output]);
  const slots = parsed?.slots ?? [];
  const outputError = parsed?.error;
  const resultsCount = slots.length;

  const summary = outputError ? 'Failed to find free time' : 'Found free time';
  const hasError = error || cancelled || !!outputError;
  const showResultsCount = hasOutput && !outputError && resultsCount > 0;

  if (!isLast && !hasOutput && !output) {
    return null;
  }

  return (
    <ToolResultContainer
      icon={<img src={CALENDAR_ICON} alt="" className="size-5 shrink-0" aria-hidden="true" />}
      summary={summary}
      resultsCount={showResultsCount ? resultsCount : undefined}
      isExpanded={isExpanded}
      onToggle={toggleExpand}
      isLoading={isLoading}
      error={hasError}
      hasExpandableContent={hasOutput}
    >
      {outputError ? (
        <p className="text-sm text-red-500">{outputError}</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {slots.map((slot, idx) => {
            const startStr = formatSlotTime(slot.start);
            const endStr = formatSlotTime(slot.end);
            const primary = [startStr, endStr].filter(Boolean).join(' – ') || 'Free slot';
            return (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-text-secondary">-</span>
                <span className="min-w-0 flex-1 text-text-primary">{primary}</span>
              </li>
            );
          })}
        </ul>
      )}
    </ToolResultContainer>
  );
}
