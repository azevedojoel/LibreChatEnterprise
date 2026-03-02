import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useProgress } from '~/hooks';
import { formatDate, cn } from '~/utils';
import ToolResultContainer from './ToolResultContainer';

const MICROSOFT_ICON = '/assets/microsoft.svg';

type MicrosoftTodoTasksProps = {
  args: string | Record<string, unknown>;
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
};

type TaskItem = {
  id?: string;
  name?: string;
  status?: string;
  date?: string;
};

/** Compact JSON from API: i=items, i[].id, i[].n=name, i[].s=status, i[].d=date, e=error */
function parseOutput(output: string | null | undefined): {
  items: TaskItem[];
  error?: string;
} | null {
  if (!output || typeof output !== 'string') return null;
  const trimmed = output.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as {
      i?: Array<{ id?: string; n?: string; s?: string; d?: string }>;
      e?: string;
    };
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.e) return { items: [], error: parsed.e };
    const i = parsed.i;
    const items: TaskItem[] = Array.isArray(i)
      ? i.map((item) => ({
          id: item?.id,
          name: item?.n,
          status: item?.s,
          date: item?.d,
        }))
      : [];
    return { items };
  } catch {
    return null;
  }
}

function getStatusLabel(status?: string): string {
  if (status === 'completed') return 'Done';
  if (status === 'notStarted' || status === 'inProgress') return 'To do';
  return status ?? 'To do';
}

export default function MicrosoftTodoTasks({
  output,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
}: MicrosoftTodoTasksProps) {
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

  const parsed = useMemo(() => parseOutput(output), [output]);

  const items = parsed?.items ?? [];
  const tasksError = parsed?.error;
  const resultsCount = items.length;

  const summary = 'Listed To Do tasks';

  const hasError = error || cancelled || !!tasksError;
  const showResultsCount = hasOutput && !tasksError;

  if (!isLast && !hasOutput && !output) {
    return null;
  }

  return (
    <ToolResultContainer
      icon={<img src={MICROSOFT_ICON} alt="" className="size-5 shrink-0" aria-hidden="true" />}
      summary={summary}
      resultsCount={showResultsCount ? resultsCount : undefined}
      isExpanded={isExpanded}
      onToggle={toggleExpand}
      isLoading={isLoading}
      error={hasError}
      hasExpandableContent={hasOutput}
    >
      {tasksError ? (
        <p className="text-sm text-red-500">{tasksError}</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {items.map((item, idx) => {
            const name = item.name ?? 'Untitled';
            const statusLabel = getStatusLabel(item.status);
            const isCompleted = item.status === 'completed';
            const dateStr = item.date ? formatDate(item.date) : null;
            return (
              <li key={item.id ?? idx} className="flex items-center gap-2">
                <span className="shrink-0 text-text-secondary">-</span>
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate',
                    isCompleted ? 'text-text-secondary line-through' : 'text-text-primary',
                  )}
                >
                  {name}
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-xs',
                    isCompleted
                      ? 'bg-surface-tertiary text-text-secondary'
                      : 'bg-primary/10 text-primary',
                  )}
                >
                  {statusLabel}
                </span>
                {dateStr && (
                  <span className="shrink-0 text-text-secondary">{dateStr}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ToolResultContainer>
  );
}
