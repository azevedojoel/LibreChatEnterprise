import { useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { useQueryClient } from '@tanstack/react-query';
import { Play, ExternalLink, Loader2 } from 'lucide-react';
import { Button, useToastContext } from '@librechat/client';
import { QueryKeys, DynamicQueryKeys } from 'librechat-data-provider';
import type { TWorkflowRun, TConversation } from 'librechat-data-provider';
import {
  useGetWorkflowRunsQuery,
  useRunWorkflowMutation,
} from '~/data-provider';
import { useLocalize, useNavigateToConvo } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const RUNS_LIMIT = 25;

function formatRunTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: 'bg-green-500/20 text-green-600 dark:text-green-400',
    failed: 'bg-red-500/20 text-red-600 dark:text-red-400',
    running: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
    queued: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
    pending: 'bg-gray-500/20 text-gray-600 dark:text-gray-400',
  };
  const isActive = status === 'queued' || status === 'running';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium',
        colors[status] ?? 'bg-gray-500/20',
      )}
    >
      {isActive && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
      {status}
    </span>
  );
}

type WorkflowRunSectionProps = {
  workflowId: string;
  workflowName: string;
  isValid: boolean;
  canRunOrSchedule?: boolean;
};

export default function WorkflowRunSection({
  workflowId,
  workflowName,
  isValid,
  canRunOrSchedule = true,
}: WorkflowRunSectionProps) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { navigateToConvo } = useNavigateToConvo(0);
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const { showToast } = useToastContext();

  const { data: runs = [], isLoading: runsLoading } = useGetWorkflowRunsQuery(
    workflowId,
    RUNS_LIMIT,
    { enabled: !!workflowId },
  );
  const runMutation = useRunWorkflowMutation();

  const handleRunNow = useCallback(() => {
    if (!canRunOrSchedule) {
      showToast({
        message: localize('com_ui_workflows_save_first'),
        status: 'error',
      });
      return;
    }
    if (!isValid) {
      showToast({
        message: localize('com_ui_workflows_validation_all_required'),
        status: 'error',
      });
      return;
    }
    runMutation.mutate(workflowId, {
      onSuccess: (res) => {
        if (res?.conversationId) {
          showToast({
            message: localize('com_ui_success'),
            status: 'success',
          });
          queryClient.invalidateQueries([QueryKeys.messages, res.conversationId]);
          queryClient.invalidateQueries(DynamicQueryKeys.workflowRuns(workflowId));
          navigateToConvo(
            { conversationId: res.conversationId } as TConversation,
            {
              currentConvoId: conversation?.conversationId ?? undefined,
              resetLatestMessage: true,
            },
          );
        }
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : localize('com_ui_error');
        showToast({ message: msg, status: 'error' });
      },
    });
  }, [
    workflowId,
    isValid,
    canRunOrSchedule,
    localize,
    showToast,
    runMutation,
    queryClient,
    navigateToConvo,
    conversation?.conversationId,
  ]);

  const handleViewRun = useCallback(
    (run: TWorkflowRun) => {
      if (run.conversationId) {
        queryClient.invalidateQueries([QueryKeys.messages, run.conversationId]);
        navigateToConvo(
          { conversationId: run.conversationId } as TConversation,
          {
            currentConvoId: conversation?.conversationId ?? undefined,
            resetLatestMessage: true,
          },
        );
      }
    },
    [queryClient, navigateToConvo, conversation?.conversationId],
  );

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button
          size="sm"
          onClick={handleRunNow}
          disabled={runMutation.isLoading || !canRunOrSchedule}
          className="w-full"
          title={!canRunOrSchedule ? localize('com_ui_workflows_save_first') : undefined}
        >
          {runMutation.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="mr-1.5 h-4 w-4" aria-hidden="true" />
          )}
          {localize('com_ui_workflows_run_now')}
        </Button>
      </div>

      <div>
        <h4 className="mb-1.5 text-xs font-medium text-text-secondary">
          {localize('com_ui_workflows_past_runs')}
        </h4>
        <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded border border-border-light bg-surface-secondary p-1.5">
          {runsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-text-secondary" aria-hidden="true" />
            </div>
          ) : runs.length === 0 ? (
            <p className="py-2 text-center text-xs text-text-tertiary">
              —
            </p>
          ) : (
            runs.map((run) => (
              <div
                key={run._id}
                className="flex items-center justify-between gap-2 rounded bg-surface-primary px-2 py-1.5 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-text-primary">
                    {formatRunTime(run.runAt)}
                  </div>
                  <StatusBadge status={run.status} />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 px-1.5"
                  onClick={() => handleViewRun(run)}
                  disabled={!run.conversationId}
                  aria-label={localize('com_ui_workflows_view_run')}
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
