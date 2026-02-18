import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Play, Trash2, ExternalLink, Loader2, Square, Clock } from 'lucide-react';
import cronstrue from 'cronstrue';
import {
  Button,
  Spinner,
  Switch,
  OGDialog,
  OGDialogTemplate,
  Label,
  useToastContext,
} from '@librechat/client';
import { QueryKeys } from 'librechat-data-provider';
import type { ScheduledAgentSchedule, ScheduledRun, TConversation } from 'librechat-data-provider';
import {
  useGetScheduledAgentsQuery,
  useGetScheduledAgentRunsQuery,
  useCreateScheduledAgentMutation,
  useUpdateScheduledAgentMutation,
  useDeleteScheduledAgentMutation,
  useRunScheduledAgentMutation,
  useCancelScheduledRunMutation,
  useGetEndpointsQuery,
} from '~/data-provider';
import { useListAgentsQuery } from '~/data-provider/Agents';
import { useLocalize, useNavigateToConvo } from '~/hooks';
import ScheduleForm from '~/components/SidePanel/ScheduledAgents/ScheduleForm';
import { ScheduledRunProgress } from '~/components/SidePanel/ScheduledAgents/ScheduledRunProgress';
import { useHasAccess } from '~/hooks';
import { PermissionTypes, Permissions, PermissionBits } from 'librechat-data-provider';
import { EModelEndpoint } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import { cn } from '~/utils';
import store from '~/store';
import type { ScheduleFormValues } from '~/components/SidePanel/ScheduledAgents/ScheduleForm';

const RUNS_LIMIT = 25;

function formatRunTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function getScheduleDescription(schedule: ScheduledAgentSchedule): string {
  if (schedule.scheduleType === 'recurring' && schedule.cronExpression) {
    try {
      return cronstrue.toString(schedule.cronExpression);
    } catch {
      return schedule.cronExpression;
    }
  }
  if (schedule.scheduleType === 'one-off' && schedule.runAt) {
    try {
      return formatRunTime(schedule.runAt);
    } catch {
      return schedule.runAt;
    }
  }
  return '—';
}

function getNextRunText(schedule: ScheduledAgentSchedule, completedLabel: string): string {
  if (schedule.nextRunAt) {
    return formatRunTime(schedule.nextRunAt);
  }
  if (schedule.scheduleType === 'one-off' && schedule.runAt) {
    try {
      const runAt = new Date(schedule.runAt);
      if (runAt <= new Date()) {
        return completedLabel;
      }
    } catch {
      // fallthrough
    }
  }
  return '—';
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

type PromptScheduleSectionProps = {
  promptGroupId: string;
  promptGroupName: string;
};

export default function PromptScheduleSection({
  promptGroupId,
  promptGroupName,
}: PromptScheduleSectionProps) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { navigateToConvo } = useNavigateToConvo(0);
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const { showToast } = useToastContext();
  const [formOpen, setFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduledAgentSchedule | null>(null);
  const [runNowAgentId, setRunNowAgentId] = useState<string>('');

  const { data: startupConfig } = useGetStartupConfig();
  const { data: endpointsConfig = {} } = useGetEndpointsQuery();
  const interfaceConfig = startupConfig?.interface ?? {};
  const scheduledAgentsEnabled = interfaceConfig.scheduledAgents !== false;

  const hasAgentsEndpoint = !!endpointsConfig?.[EModelEndpoint.agents];
  const hasAccessToAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });
  const canUseScheduling = hasAgentsEndpoint && hasAccessToAgents;

  const shouldShow = scheduledAgentsEnabled && !!promptGroupId;

  const { data: schedules = [], isLoading: schedulesLoading } = useGetScheduledAgentsQuery(
    { promptGroupId },
    { enabled: shouldShow },
  );
  const { data: runs = [], isLoading: runsLoading } = useGetScheduledAgentRunsQuery(
    { limit: RUNS_LIMIT, promptGroupId },
    { enabled: shouldShow },
  );
  const { data: agentsData } = useListAgentsQuery({
    limit: 100,
    requiredPermission: PermissionBits.VIEW,
  });

  const createMutation = useCreateScheduledAgentMutation();
  const updateMutation = useUpdateScheduledAgentMutation();
  const deleteMutation = useDeleteScheduledAgentMutation();
  const runMutation = useRunScheduledAgentMutation();
  const cancelRunMutation = useCancelScheduledRunMutation();

  const agents = agentsData?.data ?? [];
  const agentsMap = Object.fromEntries(agents.map((a) => [a.id, a.name]));

  const handleFormSuccess = () => {
    setFormOpen(false);
    setEditingSchedule(null);
    showToast({ message: localize('com_ui_success'), status: 'success' });
  };

  const handleFormError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : localize('com_ui_error');
    showToast({ message: msg || localize('com_ui_error'), status: 'error' });
  };

  const handleRunSuccess = useCallback(
    (res: {
      success: boolean;
      conversationId?: string;
      runId?: string;
      error?: string;
    }) => {
      if (res.success && res.conversationId) {
        showToast({
          message: localize('com_sidepanel_scheduled_agents_conversation_created'),
          status: 'success',
        });
      } else {
        showToast({ message: res.error || localize('com_ui_error'), status: 'error' });
      }
    },
    [localize, showToast],
  );

  const handleRunError = useCallback(
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : localize('com_ui_error');
      showToast({ message: msg, status: 'error' });
    },
    [localize, showToast],
  );

  const handleRunNow = useCallback(() => {
    const agentId = runNowAgentId || agents[0]?.id;
    if (!agentId || !agents.length) {
      showToast({ message: localize('com_ui_no_agent'), status: 'error' });
      return;
    }
    const payload = {
      name: `${promptGroupName} — ${localize('com_prompts_run_now')}`,
      agentId,
      promptGroupId,
      scheduleType: 'one-off' as const,
      runAt: new Date().toISOString(),
      timezone: 'UTC',
    };
    createMutation.mutate(payload, {
      onSuccess: (schedule) => {
        const scheduleId = schedule._id;
        runMutation.mutate(scheduleId, {
          onSuccess: (runResult) => {
            handleRunSuccess(runResult);
            deleteMutation.mutate(scheduleId);
          },
          onError: handleRunError,
        });
      },
      onError: handleFormError,
    });
  }, [
    agents,
    runNowAgentId,
    promptGroupId,
    promptGroupName,
    localize,
    createMutation,
    runMutation,
    deleteMutation,
    handleRunSuccess,
    handleRunError,
    showToast,
  ]);

  useEffect(() => {
    if (agents.length > 0 && !runNowAgentId) {
      setRunNowAgentId(agents[0].id);
    }
  }, [agents, runNowAgentId]);

  const handleToggle = (schedule: ScheduledAgentSchedule) => {
    updateMutation.mutate({ id: schedule._id, data: { enabled: !schedule.enabled } });
  };

  const handleEdit = (schedule: ScheduledAgentSchedule) => {
    setEditingSchedule(schedule);
    setFormOpen(true);
  };

  const handleViewRun = (run: ScheduledRun) => {
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
  };

  const handleCancelRun = (runId: string) => {
    cancelRunMutation.mutate(runId, {
      onSuccess: () => {
        showToast({ message: localize('com_ui_success'), status: 'success' });
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : localize('com_ui_error');
        showToast({ message: msg, status: 'error' });
      },
    });
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditingSchedule(null);
  };

  const handleFormSubmit = useCallback(
    (data: ScheduleFormValues) => {
      const payload = {
        name: data.name,
        agentId: data.agentId,
        promptGroupId: data.promptGroupId || promptGroupId,
        scheduleType: data.scheduleType,
        ...(data.scheduleType === 'recurring'
          ? { cronExpression: data.cronExpression }
          : { runAt: data.runAt }),
        timezone: data.timezone || 'UTC',
        ...(data.selectedTools !== undefined && { selectedTools: data.selectedTools }),
      };
      const opts = { onSuccess: handleFormSuccess, onError: handleFormError };
      if (editingSchedule) {
        updateMutation.mutate({ id: editingSchedule._id, data: payload }, opts);
      } else {
        createMutation.mutate(payload, opts);
      }
    },
    [
      promptGroupId,
      editingSchedule,
      createMutation,
      updateMutation,
      handleFormSuccess,
      handleFormError,
    ],
  );

  if (!shouldShow) {
    return null;
  }

  const noAgents = !agents.length && agentsData !== undefined;
  const actionsDisabled = !canUseScheduling || noAgents;

  return (
    <div
      className="mt-4 rounded-lg border border-border-light bg-surface-primary p-4"
      role="region"
      aria-label={localize('com_prompts_schedule_section')}
    >
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-text-primary">
        <Clock className="h-4 w-4" aria-hidden="true" />
        {localize('com_prompts_schedule_section')}
      </h2>

      {/* Run Now */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={runNowAgentId}
          onChange={(e) => setRunNowAgentId(e.target.value)}
          className="flex h-9 min-w-[160px] rounded-md border border-border-medium bg-transparent px-3 py-1 text-sm text-text-primary"
          aria-label={localize('com_ui_agent')}
          disabled={actionsDisabled}
        >
          <option value="">{localize('com_ui_select')}</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRunNow}
          disabled={createMutation.isLoading || runMutation.isLoading || actionsDisabled}
          aria-label={localize('com_prompts_run_now')}
        >
          <Play className="mr-1 h-4 w-4" aria-hidden="true" />
          {localize('com_prompts_run_now')}
        </Button>
        {noAgents && (
          <p className="text-sm text-text-secondary">{localize('com_ui_no_agent')}</p>
        )}
      </div>

      {/* Schedules */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-text-primary">
            {localize('com_sidepanel_scheduled_agents')}
          </h3>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => {
              setEditingSchedule(null);
              setFormOpen(true);
            }}
            disabled={actionsDisabled}
            aria-label={localize('com_ui_create')}
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            {localize('com_ui_create')}
          </Button>
        </div>

        {schedulesLoading && <Spinner className="mx-auto my-4" />}
        {!schedulesLoading && schedules.length === 0 && (
          <p className="text-sm text-text-secondary">
            {localize('com_sidepanel_scheduled_agents_no_schedules')}
          </p>
        )}
        {!schedulesLoading && schedules.length > 0 && (
          <div className="space-y-2">
            {schedules.map((schedule) => (
              <div
                key={schedule._id}
                className="flex flex-col gap-1 rounded-lg border border-border-medium bg-surface-primary p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">{schedule.name}</p>
                    <p className="truncate text-xs text-text-secondary">
                      {agentsMap[schedule.agentId] ?? schedule.agentId} • {schedule.scheduleType}
                    </p>
                    <p className="truncate text-xs text-text-secondary">
                      {getScheduleDescription(schedule)}
                    </p>
                    <p className="truncate text-xs text-text-secondary">
                      {localize('com_sidepanel_scheduled_agents_next_run')}:{' '}
                      {getNextRunText(
                        schedule,
                        localize('com_sidepanel_scheduled_agents_completed'),
                      )}
                    </p>
                  </div>
                  <Switch
                    checked={schedule.enabled}
                    onCheckedChange={() => handleToggle(schedule)}
                    aria-label={`${schedule.name} enabled`}
                  />
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 flex-1"
                    onClick={() =>
                      runMutation.mutate(schedule._id, {
                        onSuccess: handleRunSuccess,
                        onError: handleRunError,
                      })
                    }
                    disabled={runMutation.isLoading}
                  >
                    <Play className="mr-1 h-3 w-3" aria-hidden="true" />
                    {localize('com_ui_run')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={() => handleEdit(schedule)}
                  >
                    {localize('com_ui_edit')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-red-600 hover:text-red-700 dark:text-red-400"
                    onClick={() => deleteMutation.mutate(schedule._id)}
                    disabled={deleteMutation.isLoading}
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {formOpen && (
          <div className="mt-4">
            <ScheduleForm
              agents={agents}
              schedule={editingSchedule}
              onClose={handleFormClose}
              onSubmit={handleFormSubmit}
              isSubmitting={createMutation.isLoading || updateMutation.isLoading}
              fixedPromptGroupId={promptGroupId}
            />
          </div>
        )}
      </div>

      {/* Run History */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-text-primary">
          {localize('com_prompts_run_history')}
        </h3>
        {runsLoading && <Spinner className="mx-auto my-4" />}
        {!runsLoading && runs.length === 0 && (
          <p className="text-sm text-text-secondary">
            {localize('com_sidepanel_scheduled_agents_no_recent_runs')}
          </p>
        )}
        {!runsLoading && runs.length > 0 && (
          <div className="space-y-1">
            {runs.map((run) => {
              const scheduleInfo =
                run.scheduleId && typeof run.scheduleId === 'object'
                  ? run.scheduleId
                  : { name: 'Schedule', agentId: '' };
              return (
                <div
                  key={run._id}
                  className="flex flex-col gap-1 rounded border border-border-medium bg-surface-primary px-2 py-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-text-primary">{scheduleInfo.name}</p>
                      <p className="text-xs text-text-secondary">{formatRunTime(run.runAt)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={run.status} />
                      {(run.status === 'queued' || run.status === 'running') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7"
                          onClick={() => handleCancelRun(run._id)}
                          disabled={
                            cancelRunMutation.isLoading && cancelRunMutation.variables === run._id
                          }
                          aria-label={localize('com_nav_stop_generating')}
                          title={localize('com_nav_stop_generating')}
                        >
                          {cancelRunMutation.isLoading &&
                          cancelRunMutation.variables === run._id ? (
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                          ) : (
                            <Square className="h-3 w-3" aria-hidden="true" fill="currentColor" />
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7"
                        onClick={() => handleViewRun(run)}
                        aria-label={localize('com_ui_view')}
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  {run.status === 'running' && run.conversationId && (
                    <ScheduledRunProgress
                      runId={run._id}
                      streamId={run.conversationId}
                      status={run.status}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
