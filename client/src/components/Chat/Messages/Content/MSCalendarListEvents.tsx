import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { ExternalLink } from 'lucide-react';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useProgress } from '~/hooks';
import { formatDate } from '~/utils';
import { parseMSCalendarOutput } from '~/utils/parseToolOutput';
import ToolResultContainer from './ToolResultContainer';

const MS_CALENDAR_ICON = '/assets/microsoft.svg';

function formatEventTime(start?: { dateTime?: string; timeZone?: string }): string {
  if (!start?.dateTime) return '';
  return formatDate(start.dateTime);
}

type MSCalendarListEventsProps = {
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
};

const OUTLOOK_CALENDAR_URL = 'https://outlook.live.com/calendar/';

export default function MSCalendarListEvents({
  output,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
}: MSCalendarListEventsProps) {
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

  const parsed = useMemo(() => parseMSCalendarOutput(output), [output]);
  const events = parsed?.events ?? [];
  const outputError = parsed?.error;
  const resultsCount = events.length;

  const summary = `Listed ${resultsCount} event${resultsCount === 1 ? '' : 's'}`;
  const hasError = error || cancelled || !!outputError;
  const showResultsCount = hasOutput && !outputError;

  if (!isLast && !hasOutput && !output) {
    return null;
  }

  return (
    <ToolResultContainer
      icon={
        <img src={MS_CALENDAR_ICON} alt="" className="size-5 shrink-0" aria-hidden="true" />
      }
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
          {events.map((evt, idx) => {
            const primary = evt.subject ?? 'Untitled';
            const startStr = formatEventTime(evt.start);
            const endStr = formatEventTime(evt.end);
            const timeRange = [startStr, endStr].filter(Boolean).join(' – ');
            const url = evt.webLink ?? null;
            return (
              <li key={evt.id ?? idx} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-text-secondary">-</span>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-text-primary">{primary}</span>
                  {timeRange && (
                    <span className="mt-0.5 block text-xs text-text-secondary">{timeRange}</span>
                  )}
                </div>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
                    title={primary}
                  >
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ToolResultContainer>
  );
}
