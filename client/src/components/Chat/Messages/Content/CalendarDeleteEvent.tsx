import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useProgress, useToolApproval } from '~/hooks';
import { parseCalendarDeleteOutput } from '~/utils/parseToolOutput';
import ToolResultContainer from './ToolResultContainer';
import ToolApprovalBar from './ToolApprovalBar';
import { cn } from '~/utils';

const CALENDAR_ICON = '/assets/google.svg';

function parseArgs(args: string | Record<string, unknown>): Record<string, unknown> {
  try {
    const parsed = typeof args === 'string' ? JSON.parse(args) : args;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

type CalendarDeleteEventProps = {
  args?: string | Record<string, unknown>;
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
  toolName?: string;
};

export default function CalendarDeleteEvent({
  args = '',
  output,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
  toolName,
}: CalendarDeleteEventProps) {
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

  const parsed = useMemo(() => parseCalendarDeleteOutput(output), [output]);
  const outputError = parsed?.error;

  const summary = outputError ? `Failed to delete event` : `Deleted event`;
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
                <p className="text-text-secondary">Deleting event</p>
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
        <p className="text-sm text-text-secondary">Event deleted successfully.</p>
      )}
    </ToolResultContainer>
  );
}
