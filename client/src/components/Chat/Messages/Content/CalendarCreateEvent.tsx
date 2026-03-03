import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { ExternalLink } from 'lucide-react';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useLocalize, useProgress, useToolApproval } from '~/hooks';
import { formatDate } from '~/utils';
import { parseCalendarEventOutput } from '~/utils/parseToolOutput';
import ToolResultContainer from './ToolResultContainer';
import ToolApprovalBar from './ToolApprovalBar';
import { EventPreviewDetails, type EventPreviewArgs } from './EventPreviewDetails';
import { cn } from '~/utils';

const CALENDAR_ICON = '/assets/google.svg';

function formatEventTime(start?: { dateTime?: string; date?: string }): string {
  if (!start) return '';
  const dt = start.dateTime ?? start.date;
  return dt ? formatDate(dt) : '';
}

type CalendarCreateEventProps = {
  args: string | Record<string, unknown>;
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
  toolName?: string;
};

function parseArgs(args: string | Record<string, unknown>): EventPreviewArgs {
  try {
    const parsed = typeof args === 'string' ? JSON.parse(args) : args;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as EventPreviewArgs;
  } catch {
    return {};
  }
}

const GOOGLE_CALENDAR_URL = 'https://calendar.google.com/';

export default function CalendarCreateEvent({
  args,
  output,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
  toolName,
}: CalendarCreateEventProps) {
  const localize = useLocalize();
  const { conversationId, messageId } = useMessageContext();
  const expandedToolCalls = useRecoilValue(store.expandedToolCallsAtom);
  const setExpandedToolCalls = useSetRecoilState(store.expandedToolCallsAtom);
  const [localExpanded, setLocalExpanded] = useState(false);

  const { pendingMatches, approvalStatus, handleApprove, handleDeny, approvalSubmitting } =
    useToolApproval(toolCallId, output ?? '');

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

  const parsedArgs = useMemo(() => parseArgs(args), [args]);
  const parsedOutput = useMemo(() => parseCalendarEventOutput(output), [output]);
  const event = parsedOutput?.event;
  const outputError = parsedOutput?.error;

  const title = event?.summary ?? parsedArgs.summary ?? 'Untitled';
  const summary =
    isLoading || !hasOutput
      ? `Creating event: ${title.length > 40 ? `${title.slice(0, 40)}...` : title}`
      : outputError
        ? `Failed to create: ${title}`
        : `Created event: ${title.length > 40 ? `${title.slice(0, 40)}...` : title}`;

  const hasError = error || cancelled || !!outputError;

  const showApprovalBar = approvalStatus !== null;
  const isPending = approvalStatus === 'pending';

  if (!isLast && !hasOutput && !pendingMatches && !output) {
    return null;
  }

  if (showApprovalBar && isPending) {
    return (
      <div className="my-2 flex flex-col gap-2">
        <ToolApprovalBar
          onApprove={handleApprove}
          onDeny={handleDeny}
          onToggleExpand={toggleExpand}
          isExpanded={isExpanded}
          isSubmitting={approvalSubmitting}
          toolName={toolName}
        />
        <div
          className={cn(
            'overflow-hidden rounded-lg border border-border-light bg-surface-secondary transition-all duration-300',
            isExpanded ? 'max-h-[600px]' : 'max-h-0',
          )}
        >
          <div className="max-h-[596px] overflow-y-auto border-t border-border-light px-4 py-3">
            <EventPreviewDetails args={parsedArgs} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <ToolResultContainer
      icon={<img src={CALENDAR_ICON} alt="" className="size-5 shrink-0" aria-hidden="true" />}
      summary={summary}
      isExpanded={isExpanded}
      onToggle={toggleExpand}
      isLoading={isLoading}
      error={hasError}
      hasExpandableContent={!!event || !!parsedArgs.summary || hasOutput}
      minExpandHeight={120}
    >
      {outputError ? (
        <p className="text-sm text-red-500">{outputError}</p>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-text-secondary">-</span>
            <span className="min-w-0 flex-1 truncate font-medium text-text-primary">{title}</span>
            <a
              href={event?.htmlLink ?? GOOGLE_CALENDAR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
              title={title}
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              {localize('com_ui_calendar_open')}
            </a>
          </div>
          {event?.start && (
            <p className="text-xs text-text-secondary">
              {localize('com_ui_calendar_start')}: {formatEventTime(event.start)}
              {event?.end && ` — ${localize('com_ui_calendar_end')}: ${formatEventTime(event.end)}`}
            </p>
          )}
          {event?.location && (
            <p className="text-xs text-text-secondary">
              {localize('com_ui_calendar_location')}: {event.location}
            </p>
          )}
        </div>
      )}
    </ToolResultContainer>
  );
}
