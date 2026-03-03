import { useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2, Square } from 'lucide-react';
import { Button, useToastContext } from '@librechat/client';
import {
  useGetScheduledAgentRunQuery,
  useCancelScheduledRunMutation,
} from '~/data-provider/ScheduledAgents';
import { QueryKeys } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import { useLocalize, useNavigateToConvo, type TranslationKeys } from '~/hooks';
import { ScheduledRunProgress } from '~/components/SidePanel/ScheduledAgents/ScheduledRunProgress';
import store from '~/store';
import { cn } from '~/utils';

function SchedulerStatusBadge({ status }: { status: string }) {
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

function formatRunTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

type RunScheduleNowWidgetProps = {
  runId: string;
  conversationId: string;
  initialStatus?: string;
};

/**
 * Live widget for run_schedule tool output - shows status, progress when running,
 * and actions (cancel, view) matching the dashboard/ScheduledAgents panel.
 */
export function RunScheduleNowWidget({
  runId,
  conversationId,
  initialStatus = 'queued',
}: RunScheduleNowWidgetProps) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { navigateToConvo } = useNavigateToConvo(0);
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const { showToast } = useToastContext();

  const { data: run, isLoading, isError, error } = useGetScheduledAgentRunQuery(runId);
  const cancelRunMutation = useCancelScheduledRunMutation();

  const status = run?.status ?? initialStatus;
  const scheduleInfo =
    run?.scheduleId && typeof run.scheduleId === 'object'
      ? run.scheduleId
      : { name: localize('com_sidepanel_scheduled_agents_schedule' as TranslationKeys), agentId: '' };

  const handleViewRun = useCallback(() => {
    if (conversationId) {
      queryClient.invalidateQueries([QueryKeys.messages, conversationId]);
      navigateToConvo({ conversationId } as TConversation, {
        currentConvoId: conversation?.conversationId ?? undefined,
        resetLatestMessage: true,
      });
    }
  }, [conversationId, queryClient, navigateToConvo, conversation?.conversationId]);

  const handleCancelRun = useCallback(() => {
    cancelRunMutation.mutate(runId, {
      onSuccess: () => {
        showToast({ message: localize('com_ui_success'), status: 'success' });
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : localize('com_ui_error');
        showToast({ message: msg, status: 'error' });
      },
    });
  }, [runId, cancelRunMutation, showToast, localize]);

  if (isError) {
    const errorMsg =
      error instanceof Error ? error.message : localize('com_ui_error');
    return (
      <div className="rounded-lg border border-border-medium bg-surface-secondary p-2">
        <div className="text-sm text-red-600 dark:text-red-400">{errorMsg}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border-medium bg-surface-secondary p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">
            {isLoading && !run
              ? localize('com_scheduler_run_queued' as TranslationKeys)
              : scheduleInfo.name}
          </p>
          {run?.runAt && (
            <p className="truncate text-xs text-text-secondary">{formatRunTime(run.runAt)}</p>
          )}
          {status === 'queued' && !run && (
            <p className="text-xs text-text-secondary">
              {localize('com_scheduler_run_queued' as TranslationKeys)} {runId}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <SchedulerStatusBadge status={status} />
          {(status === 'queued' || status === 'running') && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 text-text-primary"
              onClick={handleCancelRun}
              disabled={cancelRunMutation.isLoading && cancelRunMutation.variables === runId}
              aria-label={localize('com_nav_stop_generating')}
              title={localize('com_nav_stop_generating')}
            >
              {cancelRunMutation.isLoading && cancelRunMutation.variables === runId ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <Square className="h-3 w-3" aria-hidden="true" fill="currentColor" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 text-text-primary"
            onClick={handleViewRun}
            aria-label={localize('com_ui_view')}
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </Button>
        </div>
      </div>
      {status === 'running' && conversationId && (
        <ScheduledRunProgress
          runId={runId}
          streamId={conversationId}
          status={status}
        />
      )}
    </div>
  );
}
