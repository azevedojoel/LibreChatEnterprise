import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { ExternalLink } from 'lucide-react';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useProgress } from '~/hooks';
import { formatDate } from '~/utils';
import ToolResultContainer from './ToolResultContainer';

const GOOGLE_TASKS_ICON = '/assets/google.svg';

type GoogleTaskListsProps = {
  args: string | Record<string, unknown>;
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
};

type TaskListItem = {
  id?: string;
  name?: string;
  date?: string;
};

/** Compact JSON from API: i=items, i[].id, i[].n=name, i[].d=date, e=error, p=nextPageToken */
function parseOutput(output: string | null | undefined): {
  items: TaskListItem[];
  error?: string;
  nextPageToken?: string;
} | null {
  if (!output || typeof output !== 'string') return null;
  const trimmed = output.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as {
      i?: Array<{ id?: string; n?: string; d?: string }>;
      e?: string;
      p?: string;
    };
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.e) return { items: [], error: parsed.e };
    const i = parsed.i;
    const items: TaskListItem[] = Array.isArray(i)
      ? i.map((item) => ({
          id: item?.id,
          name: item?.n,
          date: item?.d,
        }))
      : [];
    return { items, nextPageToken: parsed.p };
  } catch {
    return null;
  }
}

const GOOGLE_TASKS_URL = 'https://tasks.google.com/';

export default function GoogleTaskLists({
  output,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
}: GoogleTaskListsProps) {
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
  const listsError = parsed?.error;
  const resultsCount = items.length;

  const summary = 'Listed Google task lists';

  const hasError = error || cancelled || !!listsError;
  const showResultsCount = hasOutput && !listsError;

  if (!isLast && !hasOutput && !output) {
    return null;
  }

  return (
    <ToolResultContainer
      icon={<img src={GOOGLE_TASKS_ICON} alt="" className="size-5 shrink-0" aria-hidden="true" />}
      summary={summary}
      resultsCount={showResultsCount ? resultsCount : undefined}
      isExpanded={isExpanded}
      onToggle={toggleExpand}
      isLoading={isLoading}
      error={hasError}
      hasExpandableContent={hasOutput}
    >
      {listsError ? (
        <p className="text-sm text-red-500">{listsError}</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {items.map((item, idx) => {
            const name = item.name ?? 'Untitled';
            const dateStr = item.date ? formatDate(item.date) : null;
            return (
              <li key={item.id ?? idx} className="flex items-center gap-2">
                <span className="shrink-0 text-text-secondary">-</span>
                <span className="min-w-0 flex-1 truncate text-text-primary">{name}</span>
                {dateStr && (
                  <span className="shrink-0 text-text-secondary">{dateStr}</span>
                )}
                <a
                  href={GOOGLE_TASKS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
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
