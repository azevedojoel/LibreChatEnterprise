import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { ExternalLink } from 'lucide-react';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useProgress, useToolApproval } from '~/hooks';
import ToolResultContainer from './ToolResultContainer';
import ToolApprovalContainer from './ToolApprovalContainer';
import { cn } from '~/utils';

const GOOGLE_TASKS_ICON = '/assets/google.svg';

type GoogleTaskListUpdateProps = {
  args: string | Record<string, unknown>;
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
};

type UpdateTaskListArgs = {
  taskListId?: string;
  title?: string;
};

type UpdateTaskListOutput = {
  id?: string;
  title?: string;
  error?: string;
};

function parseArgs(args: string | Record<string, unknown>): UpdateTaskListArgs {
  try {
    const parsed = typeof args === 'string' ? JSON.parse(args) : args;
    if (!parsed || typeof parsed !== 'object') return {};
    return {
      taskListId: typeof parsed.taskListId === 'string' ? parsed.taskListId : undefined,
      title: typeof parsed.title === 'string' ? parsed.title : undefined,
    };
  } catch {
    return {};
  }
}

function parseOutput(output: string | null | undefined): UpdateTaskListOutput | null {
  if (!output || typeof output !== 'string') return null;
  const trimmed = output.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { id?: string; title?: string; error?: string };
      if (!parsed || typeof parsed !== 'object') return null;
      if (parsed.error) return { error: String(parsed.error) };
      return { id: parsed.id, title: parsed.title };
    } catch {
      return { error: 'Invalid response' };
    }
  }
  if (/error\s*[:=]/i.test(trimmed)) return { error: trimmed };
  const titleMatch = trimmed.match(/title\s*[:=]\s*["']?([^"'\n]+?)["']?(?:\s+id|\s+kind|\s*$)/im) ?? trimmed.match(/title\s*[:=]\s*["']?([^"'\n]+)/im);
  const idMatch = trimmed.match(/\bid\s*[:=]\s*["']?([^\s"'\n]+)["']?/im);
  if (titleMatch?.[1] || idMatch?.[1]) return { id: idMatch?.[1], title: titleMatch?.[1]?.trim() };
  return null;
}

const GOOGLE_TASKS_URL = 'https://tasks.google.com/';

export default function GoogleTaskListUpdate({
  args,
  output,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
}: GoogleTaskListUpdateProps) {
  const { conversationId, messageId } = useMessageContext();
  const expandedToolCalls = useRecoilValue(store.expandedToolCallsAtom);
  const setExpandedToolCalls = useSetRecoilState(store.expandedToolCallsAtom);
  const [localExpanded, setLocalExpanded] = useState(false);

  const { pendingMatches, approvalStatus, handleApprove, handleDeny, approvalSubmitting, denialReason } =
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
  const parsedOutput = useMemo(() => parseOutput(output), [output]);

  const title = parsedArgs.title ?? parsedOutput?.title ?? 'List';
  const outputError = parsedOutput?.error;

  const showApprovalBar = approvalStatus !== null;
  const isPending = approvalStatus === 'pending';

  const summary =
    isPending || !hasOutput
      ? `Renaming list to: ${title.length > 40 ? `${title.slice(0, 40)}...` : title}`
      : outputError
        ? `Failed to update: ${title}`
        : `Updated list: ${title.length > 40 ? `${title.slice(0, 40)}...` : title}`;

  const hasError = error || cancelled || !!outputError;

  if (!isLast && !hasOutput && !pendingMatches && !output) {
    return null;
  }

  if (showApprovalBar && isPending) {
    return (
      <ToolApprovalContainer
        onApprove={handleApprove}
        onDeny={handleDeny}
        onToggleExpand={toggleExpand}
        isExpanded={isExpanded}
        isSubmitting={approvalSubmitting}
        toolName="tasks_updateTaskList"
      >
        <p className="text-sm font-medium text-text-primary">{title}</p>
      </ToolApprovalContainer>
    );
  }

  return (
    <ToolResultContainer
      icon={<img src={GOOGLE_TASKS_ICON} alt="" className="size-5 shrink-0" aria-hidden="true" />}
      summary={summary}
      isExpanded={isExpanded}
      onToggle={toggleExpand}
      isLoading={isLoading}
      error={hasError}
      hasExpandableContent={hasOutput}
      minExpandHeight={140}
      denialReason={denialReason}
    >
      {outputError ? (
        <p className="text-sm text-red-500">{outputError}</p>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-text-secondary">-</span>
            <span className="min-w-0 flex-1 truncate font-medium text-text-primary">{title}</span>
            <a
              href={GOOGLE_TASKS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
              title={title}
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Open
            </a>
          </div>
        </div>
      )}
    </ToolResultContainer>
  );
}
