import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { ExternalLink } from 'lucide-react';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useProgress, useToolApproval } from '~/hooks';
import ToolResultContainer from './ToolResultContainer';
import ToolApprovalContainer from './ToolApprovalContainer';
import { cn } from '~/utils';

const MICROSOFT_ICON = '/assets/microsoft.svg';

type MicrosoftTodoTaskDeleteProps = {
  args: string | Record<string, unknown>;
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
};

type DeleteTodoTaskArgs = {
  todoTaskListId?: string;
  todoTaskId?: string;
};

type DeleteTodoTaskOutput = {
  success?: boolean;
  error?: { message?: string };
};

function parseArgs(args: string | Record<string, unknown>): DeleteTodoTaskArgs {
  try {
    const parsed = typeof args === 'string' ? JSON.parse(args) : args;
    if (!parsed || typeof parsed !== 'object') return {};
    return {
      todoTaskListId: typeof parsed.todoTaskListId === 'string' ? parsed.todoTaskListId : undefined,
      todoTaskId: typeof parsed.todoTaskId === 'string' ? parsed.todoTaskId : undefined,
    };
  } catch {
    return {};
  }
}

function parseOutput(output: string | null | undefined): DeleteTodoTaskOutput | null {
  if (output == null) return null;
  const trimmed = typeof output === 'string' ? output.trim() : '';
  if (trimmed === '') return { success: true };
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { message?: string; error?: { message?: string } | string };
      if (!parsed || typeof parsed !== 'object') return null;
      const err = parsed.error;
      if (err) {
        const msg = typeof err === 'string' ? err : err?.message;
        return { error: { message: msg } };
      }
      if (parsed.message && /deleted/i.test(parsed.message)) return { success: true };
      return { success: true };
    } catch {
      return { error: { message: 'Invalid response' } };
    }
  }
  if (/error\s*[:=]/i.test(trimmed)) return { error: { message: trimmed } };
  if (/message\s*[:=]\s*.+deleted/i.test(trimmed)) return { success: true };
  return null;
}

const MICROSOFT_TODO_URL = 'https://to-do.live.com/';

export default function MicrosoftTodoTaskDelete({
  args,
  output,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
}: MicrosoftTodoTaskDeleteProps) {
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

  const outputError = parsedOutput?.error?.message;
  const isSuccess = parsedOutput?.success ?? (hasOutput === false && !isSubmitting && !cancelled);

  const showApprovalBar = approvalStatus !== null;
  const isPending = approvalStatus === 'pending';
  const hasExpandableContent = !!parsedArgs.todoTaskId || !!parsedArgs.todoTaskListId || hasOutput;

  const label = parsedArgs.todoTaskId
    ? `task ${parsedArgs.todoTaskId.length > 12 ? `${parsedArgs.todoTaskId.slice(0, 12)}...` : parsedArgs.todoTaskId}`
    : 'task';

  const summary =
    isPending || !hasOutput
      ? `Deleting ${label}`
      : outputError
        ? `Failed to delete: ${label}`
        : `Deleted ${label}`;

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
        toolName="delete-todo-task"
      >
        <div className="space-y-2 text-sm text-text-secondary">
          {parsedArgs.todoTaskId && <div>Task ID: {parsedArgs.todoTaskId}</div>}
          {parsedArgs.todoTaskListId && <div>List ID: {parsedArgs.todoTaskListId}</div>}
        </div>
      </ToolApprovalContainer>
    );
  }

  return (
    <ToolResultContainer
      icon={<img src={MICROSOFT_ICON} alt="" className="size-5 shrink-0" aria-hidden="true" />}
      summary={summary}
      isExpanded={isExpanded}
      onToggle={toggleExpand}
      isLoading={isLoading}
      error={hasError}
      hasExpandableContent={hasExpandableContent || hasOutput}
      minExpandHeight={100}
      denialReason={denialReason}
    >
      {outputError ? (
        <p className="text-sm text-red-500">{outputError}</p>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-text-secondary">-</span>
            <span className="text-text-primary">
              {isSuccess ? 'Task deleted successfully' : 'Deleting task...'}
            </span>
            <a
              href={MICROSOFT_TODO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Open To Do
            </a>
          </div>
        </div>
      )}
    </ToolResultContainer>
  );
}
