import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { ExternalLink } from 'lucide-react';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useProgress, useToolApproval } from '~/hooks';
import { formatDate } from '~/utils';
import ToolResultContainer from './ToolResultContainer';
import ToolApprovalBar from './ToolApprovalBar';
import { cn } from '~/utils';

const MICROSOFT_ICON = '/assets/microsoft.svg';

type MicrosoftTodoTaskCreateProps = {
  args: string | Record<string, unknown>;
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
};

type CreateTodoTaskArgs = {
  todoTaskListId?: string;
  title?: string;
  body?: { content?: string; contentType?: string };
  dueDateTime?: { dateTime?: string; timeZone?: string };
};

type CreateTodoTaskOutput = {
  id?: string;
  title?: string;
  error?: { message?: string };
};

function parseArgs(args: string | Record<string, unknown>): CreateTodoTaskArgs {
  try {
    const parsed = typeof args === 'string' ? JSON.parse(args) : args;
    if (!parsed || typeof parsed !== 'object') return {};
    const body = parsed.body;
    const dueDateTime = parsed.dueDateTime;
    return {
      todoTaskListId: typeof parsed.todoTaskListId === 'string' ? parsed.todoTaskListId : undefined,
      title: typeof parsed.title === 'string' ? parsed.title : undefined,
      body: body && typeof body === 'object' && typeof body.content === 'string' ? body : undefined,
      dueDateTime:
        dueDateTime && typeof dueDateTime === 'object' ? dueDateTime : undefined,
    };
  } catch {
    return {};
  }
}

function parseOutput(output: string | null | undefined): CreateTodoTaskOutput | null {
  if (!output || typeof output !== 'string') return null;
  const trimmed = output.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as {
        id?: string;
        title?: string;
        error?: { message?: string } | string;
      };
      if (!parsed || typeof parsed !== 'object') return null;
      const err = parsed.error;
      if (err) {
        const msg = typeof err === 'string' ? err : err?.message;
        return { error: { message: msg } };
      }
      return { id: parsed.id, title: parsed.title };
    } catch {
      return { error: { message: 'Invalid response' } };
    }
  }
  if (/error\s*[:=]/i.test(trimmed)) return { error: { message: trimmed } };
  const titleMatch = trimmed.match(/title\s*[:=]\s*["']?([^"'\n]+?)["']?(?:\s+id|\s+status|\s*$)/im) ?? trimmed.match(/title\s*[:=]\s*["']?([^"'\n]+)/im);
  const idMatch = trimmed.match(/\bid\s*[:=]\s*["']?([^\s"'\n]+)["']?/im);
  if (titleMatch?.[1] || idMatch?.[1]) return { id: idMatch?.[1], title: titleMatch?.[1]?.trim() };
  return null;
}

function extractDueDate(dueDateTime?: { dateTime?: string }): string | null {
  if (!dueDateTime?.dateTime) return null;
  return formatDate(dueDateTime.dateTime);
}

const TODO_URL = 'https://to-do.live.com/';

export default function MicrosoftTodoTaskCreate({
  args,
  output,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
}: MicrosoftTodoTaskCreateProps) {
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
  const parsedOutput = useMemo(() => parseOutput(output), [output]);

  const title = parsedArgs.title ?? parsedOutput?.title ?? 'Untitled';
  const bodyContent = parsedArgs.body?.content;
  const dueStr = extractDueDate(parsedArgs.dueDateTime);
  const outputError = parsedOutput?.error?.message;

  const showApprovalBar = approvalStatus !== null;
  const isPending = approvalStatus === 'pending';
  const hasExpandableContent = !!bodyContent || !!dueStr || hasOutput;

  const summary =
    isPending || !hasOutput
      ? `Creating task: ${title.length > 40 ? `${title.slice(0, 40)}...` : title}`
      : outputError
        ? `Failed to create: ${title}`
        : `Created task: ${title.length > 40 ? `${title.slice(0, 40)}...` : title}`;

  const hasError = error || cancelled || !!outputError;

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
          toolName="create-todo-task"
        />
        <div
          className={cn(
            'overflow-hidden rounded-lg border border-border-light bg-surface-secondary transition-all duration-300',
            isExpanded ? 'max-h-[400px]' : 'max-h-0',
          )}
        >
          <div className="max-h-[396px] overflow-y-auto border-t border-border-light px-3 py-2">
            <div className="space-y-2 text-sm">
              <div className="font-medium text-text-primary">{title}</div>
              {bodyContent && (
                <p className="line-clamp-2 text-text-secondary">{bodyContent}</p>
              )}
              {dueStr && (
                <p className="text-xs text-text-secondary">Due: {dueStr}</p>
              )}
            </div>
          </div>
        </div>
      </div>
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
      minExpandHeight={140}
    >
      {outputError ? (
        <p className="text-sm text-red-500">{outputError}</p>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-text-secondary">-</span>
            <span className="min-w-0 flex-1 truncate font-medium text-text-primary">{title}</span>
            <a
              href={TODO_URL}
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
