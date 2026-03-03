import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { ExternalLink } from 'lucide-react';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useProgress, useToolApproval } from '~/hooks';
import { parseCalendarRespondOutput } from '~/utils/parseToolOutput';
import ToolResultContainer from './ToolResultContainer';
import ToolApprovalBar from './ToolApprovalBar';
import { cn } from '~/utils';

const CALENDAR_ICON = '/assets/google.svg';

const GOOGLE_CALENDAR_URL = 'https://calendar.google.com/';

function parseArgs(args: string | Record<string, unknown>): Record<string, unknown> {
  try {
    const parsed = typeof args === 'string' ? JSON.parse(args) : args;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

type CalendarRespondToEventProps = {
  args?: string | Record<string, unknown>;
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
  toolName?: string;
};

function formatResponseStatus(status?: string): string {
  if (!status) return 'Responded';
  const s = status.toLowerCase();
  if (s === 'accepted') return 'Accepted';
  if (s === 'declined') return 'Declined';
  if (s === 'tentative') return 'Tentative';
  return status;
}

export default function CalendarRespondToEvent({
  args = '',
  output,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
  toolName,
}: CalendarRespondToEventProps) {
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

  const parsed = useMemo(() => parseCalendarRespondOutput(output), [output]);
  const outputError = parsed?.error;
  const summaryText = parsed?.summary ?? 'event';
  const responseStatus = formatResponseStatus(parsed?.responseStatus);

  const summary = outputError
    ? `Failed to respond: ${summaryText}`
    : `Responded to event: ${summaryText.length > 30 ? `${summaryText.slice(0, 30)}...` : summaryText} (${responseStatus})`;

  const hasError = error || cancelled || !!outputError;

  const showApprovalBar = approvalStatus !== null;
  const isPending = approvalStatus === 'pending';
  const parsedArgs = useMemo(() => parseArgs(args), [args]);

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
            isExpanded ? 'max-h-[400px]' : 'max-h-0',
          )}
        >
          <div className="max-h-[396px] overflow-y-auto border-t border-border-light px-3 py-2">
            <div className="space-y-2 text-sm">
              {Object.entries(parsedArgs).map(([k, v]) =>
                v != null && v !== '' ? (
                  <div key={k}>
                    <span className="text-text-secondary">{k}: </span>
                    <span className="font-medium text-text-primary">
                      {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                    </span>
                  </div>
                ) : null,
              )}
              {Object.keys(parsedArgs).length === 0 && (
                <p className="text-text-secondary">Responding to event</p>
              )}
            </div>
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
      hasExpandableContent={hasOutput}
    >
      {outputError ? (
        <p className="text-sm text-red-500">{outputError}</p>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-text-secondary">-</span>
            <span className="min-w-0 flex-1 text-text-primary">
              {parsed?.message ?? `${responseStatus} the meeting invitation`}
            </span>
            <a
              href={GOOGLE_CALENDAR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Open Calendar
            </a>
          </div>
        </div>
      )}
    </ToolResultContainer>
  );
}
