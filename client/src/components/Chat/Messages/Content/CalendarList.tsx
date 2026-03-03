import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { ExternalLink } from 'lucide-react';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useProgress } from '~/hooks';
import { parseCalendarListOutput } from '~/utils/parseToolOutput';
import ToolResultContainer from './ToolResultContainer';

const CALENDAR_ICON = '/assets/google.svg';

const GOOGLE_CALENDAR_URL = 'https://calendar.google.com/';

type CalendarListProps = {
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
};

export default function CalendarList({
  output,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
}: CalendarListProps) {
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

  const parsed = useMemo(() => parseCalendarListOutput(output), [output]);
  const calendars = parsed?.calendars ?? [];
  const gmailError = parsed?.error;
  const resultsCount = calendars.length;

  const summary = `Listed ${resultsCount} calendar${resultsCount === 1 ? '' : 's'}`;
  const hasError = error || cancelled || !!gmailError;
  const showResultsCount = hasOutput && !gmailError;

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
      {gmailError ? (
        <p className="text-sm text-red-500">{gmailError}</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {calendars.map((cal, idx) => {
            const name = cal.summary ?? 'Unnamed';
            return (
              <li key={cal.id ?? idx} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-text-secondary">-</span>
                <span className="min-w-0 flex-1 truncate text-text-primary">{name}</span>
                <a
                  href={GOOGLE_CALENDAR_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
                  title={name}
                >
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </ToolResultContainer>
  );
}
