import { useCallback, useMemo, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2, Pencil, Play, Square, Trash2 } from 'lucide-react';
import {
  EModelEndpoint,
  PermissionBits,
  Permissions,
  PermissionTypes,
  QueryKeys,
} from 'librechat-data-provider';
import type { ScheduledAgentSchedule, ScheduledRun, TConversation } from 'librechat-data-provider';
import {
  useGetScheduledAgentsQuery,
  useGetScheduledAgentRunsQuery,
  useGetEndpointsQuery,
  useGetStartupConfig,
} from '~/data-provider';
import {
  useCancelScheduledRunMutation,
  useDeleteScheduledAgentMutation,
  useRunScheduledAgentMutation,
  useUpdateScheduledAgentMutation,
} from '~/data-provider';
import { useListAgentsQuery } from '~/data-provider/Agents';
import {
  Button,
  Label,
  OGDialog,
  OGDialogTemplate,
  Switch,
  useToastContext,
} from '@librechat/client';
import { Trans } from 'react-i18next';
import {
  useLocalize,
  useNavigateToConvo,
  useSubmitMessage,
  useHasAccess,
  type TranslationKeys,
} from '~/hooks';
import ScheduleForm from '~/components/SidePanel/ScheduledAgents/ScheduleForm';
import { ScheduledRunProgress } from '~/components/SidePanel/ScheduledAgents/ScheduledRunProgress';
import CollapsibleWidget from './CollapsibleWidget';
import { cn } from '~/utils';
import store from '~/store';

const RUNS_LIMIT = 10;

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

const SAMPLE_PROMPTS = ['com_ui_dashboard_scheduled_prompt_start'] as const;

function formatRunTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
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

export default function ScheduledAgentsWidget() {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { submitMessage } = useSubmitMessage();
  const { navigateToConvo } = useNavigateToConvo(0);
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const { showToast } = useToastContext();
  const { data: startupConfig } = useGetStartupConfig();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const hasAccessToAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scheduleToDelete, setScheduleToDelete] = useState<ScheduledAgentSchedule | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduledAgentSchedule | null>(null);

  const interfaceConfig = startupConfig?.interface ?? {};
  const scheduledAgentsEnabled = interfaceConfig.scheduledAgents !== false;
  const agentsEndpointAvailable = !!endpointsConfig?.[EModelEndpoint.agents];

  const { data: schedules = [], isLoading: schedulesLoading } = useGetScheduledAgentsQuery(
    undefined,
    {
      enabled: scheduledAgentsEnabled && agentsEndpointAvailable && hasAccessToAgents,
    },
  );
  const { data: runs = [] } = useGetScheduledAgentRunsQuery(RUNS_LIMIT, {
    enabled: scheduledAgentsEnabled && agentsEndpointAvailable && hasAccessToAgents,
  });
  const { data: agentsData } = useListAgentsQuery({
    limit: 100,
    requiredPermission: PermissionBits.VIEW,
  });

  const deleteMutation = useDeleteScheduledAgentMutation();
  const runMutation = useRunScheduledAgentMutation();
  const updateMutation = useUpdateScheduledAgentMutation();
  const cancelRunMutation = useCancelScheduledRunMutation();

  const agents = agentsData?.data ?? [];
  const agentsMap = useMemo(() => {
    const data = agentsData?.data ?? [];
    return Object.fromEntries(data.map((a) => [a.id, a.name]));
  }, [agentsData?.data]);

  const handleFormSuccess = useCallback(() => {
    setFormOpen(false);
    setEditingSchedule(null);
    showToast({ message: localize('com_ui_success'), status: 'success' });
  }, [showToast, localize]);

  const handleFormError = useCallback(
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : localize('com_ui_error');
      showToast({ message: msg || localize('com_ui_error'), status: 'error' });
    },
    [showToast, localize],
  );

  const handleFormClose = useCallback(() => {
    setFormOpen(false);
    setEditingSchedule(null);
  }, []);

  const handleEdit = useCallback((schedule: ScheduledAgentSchedule) => {
    setEditingSchedule(schedule);
    setFormOpen(true);
  }, []);

  const handleToggle = useCallback(
    (schedule: ScheduledAgentSchedule) => {
      updateMutation.mutate({ id: schedule._id, data: { enabled: !schedule.enabled } });
    },
    [updateMutation],
  );

  const upcomingSchedules = useMemo(() => {
    return schedules
      .filter((s) => s.enabled && s.nextRunAt)
      .sort((a, b) => {
        const aTime = new Date(a.nextRunAt!).getTime();
        const bTime = new Date(b.nextRunAt!).getTime();
        return aTime - bTime;
      });
  }, [schedules]);

  const pausedSchedules = useMemo(() => schedules.filter((s) => !s.enabled), [schedules]);

  const queuedOrRunningRuns = useMemo(
    () => runs.filter((r) => r.status === 'queued' || r.status === 'running'),
    [runs],
  );

  const completedRuns = useMemo(
    () =>
      runs
        .filter((r) => r.status === 'success' || r.status === 'failed')
        .sort((a, b) => new Date(b.runAt).getTime() - new Date(a.runAt).getTime())
        .slice(0, 3),
    [runs],
  );

  const handleViewRun = useCallback(
    (run: ScheduledRun) => {
      if (run.conversationId) {
        queryClient.invalidateQueries([QueryKeys.messages, run.conversationId]);
        navigateToConvo({ conversationId: run.conversationId } as TConversation, {
          currentConvoId: conversation?.conversationId ?? undefined,
          resetLatestMessage: true,
        });
      }
    },
    [queryClient, navigateToConvo, conversation?.conversationId],
  );

  const handleCancelRun = useCallback(
    (runId: string) => {
      cancelRunMutation.mutate(runId, {
        onSuccess: () => {
          showToast({ message: localize('com_ui_success'), status: 'success' });
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : localize('com_ui_error');
          showToast({ message: msg, status: 'error' });
        },
      });
    },
    [cancelRunMutation, showToast, localize],
  );

  const handlePrompt = useCallback(
    (text: string) => {
      submitMessage({ text });
    },
    [submitMessage],
  );

  const handleRun = useCallback(
    (schedule: ScheduledAgentSchedule) => {
      runMutation.mutate(schedule._id, {
        onSuccess: (res) => {
          if (res.success && res.conversationId) {
            showToast({
              message: localize('com_sidepanel_scheduled_agents_conversation_created'),
              status: 'success',
            });
          } else {
            showToast({ message: res.error || localize('com_ui_error'), status: 'error' });
          }
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : localize('com_ui_error');
          showToast({ message: msg, status: 'error' });
        },
      });
    },
    [runMutation, showToast, localize],
  );

  const handleDeleteClick = useCallback((schedule: ScheduledAgentSchedule) => {
    setScheduleToDelete(schedule);
    setDeleteDialogOpen(true);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!scheduleToDelete) return;
    deleteMutation.mutate(scheduleToDelete._id, {
      onSuccess: () => {
        showToast({ message: localize('com_ui_success'), status: 'success' });
        setDeleteDialogOpen(false);
        setScheduleToDelete(null);
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : localize('com_ui_error');
        showToast({ message: msg, status: 'error' });
        setDeleteDialogOpen(false);
        setScheduleToDelete(null);
      },
    });
  }, [scheduleToDelete, deleteMutation, showToast, localize]);

  if (!scheduledAgentsEnabled || !agentsEndpointAvailable || !hasAccessToAgents) {
    return null;
  }

  return (
    <CollapsibleWidget title={localize('com_ui_dashboard_scheduled_title')} storageKey="scheduled">
      <div className="mb-3">
        <p className="mb-1.5 text-xs font-medium text-text-secondary">
          {localize('com_sidepanel_scheduled_agents_upcoming')}
        </p>
        {schedulesLoading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-text-secondary" aria-hidden="true" />
          </div>
        )}
        {!schedulesLoading && upcomingSchedules.length === 0 && (
          <p className="text-sm text-text-secondary">
            {localize('com_sidepanel_scheduled_agents_no_schedules')}
          </p>
        )}
        {!schedulesLoading && upcomingSchedules.length > 0 && (
          <div className="space-y-2">
            {upcomingSchedules.map((schedule) => {
              const nextRunText = getNextRunText(
                schedule,
                localize('com_sidepanel_scheduled_agents_completed'),
              );
              const agentName = agentsMap[schedule.agentId] ?? schedule.agentId;
              return (
                <div
                  key={schedule._id}
                  className="flex flex-col gap-1.5 rounded-lg border border-border-medium bg-surface-secondary p-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {schedule.name}
                      </p>
                      <p className="truncate text-xs text-text-secondary">{agentName}</p>
                      <p className="truncate text-xs text-text-secondary">
                        {localize('com_sidepanel_scheduled_agents_next_run')}: {nextRunText}
                      </p>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={schedule.enabled}
                        onCheckedChange={() => handleToggle(schedule)}
                        aria-label={`${schedule.name} enabled`}
                      />
                    </div>
                  </div>
                  <div
                    className="flex items-center justify-between gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-text-primary"
                        onClick={() => handleRun(schedule)}
                        disabled={runMutation.isLoading}
                        aria-label={localize('com_ui_run')}
                      >
                        <Play className="h-3 w-3" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 text-text-primary"
                        onClick={() => handleEdit(schedule)}
                      >
                        <Pencil className="mr-1 h-3 w-3" aria-hidden="true" />
                        {localize('com_ui_edit')}
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                      onClick={() => handleDeleteClick(schedule)}
                      disabled={deleteMutation.isLoading}
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {queuedOrRunningRuns.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-text-secondary">
            {localize('com_sidepanel_scheduled_agents_running' as TranslationKeys)}
          </p>
          <div className="space-y-2">
            {queuedOrRunningRuns.map((run) => {
              const scheduleInfo =
                run.scheduleId && typeof run.scheduleId === 'object'
                  ? run.scheduleId
                  : { name: 'Schedule', agentId: '' };
              const agentName = agentsMap[scheduleInfo.agentId] ?? scheduleInfo.agentId;
              return (
                <div
                  key={run._id}
                  className="flex flex-col gap-1 rounded-lg border border-border-medium bg-surface-secondary p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {scheduleInfo.name}
                      </p>
                      <p className="truncate text-xs text-text-secondary">{agentName}</p>
                      <p className="truncate text-xs text-text-secondary">
                        {formatRunTime(run.runAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <StatusBadge status={run.status} />
                      {(run.status === 'queued' || run.status === 'running') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 text-text-primary"
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
                        className="h-7 shrink-0 text-text-primary"
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
        </div>
      )}
      {completedRuns.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-text-secondary">
            {localize('com_sidepanel_scheduled_agents_recent_runs')}
          </p>
          <div className="space-y-2">
            {completedRuns.map((run) => {
              const scheduleInfo =
                run.scheduleId && typeof run.scheduleId === 'object'
                  ? run.scheduleId
                  : { name: 'Schedule', agentId: '' };
              const agentName = agentsMap[scheduleInfo.agentId] ?? scheduleInfo.agentId;
              return (
                <div
                  key={run._id}
                  className="flex flex-col gap-1 rounded-lg border border-border-medium bg-surface-secondary p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {scheduleInfo.name}
                      </p>
                      <p className="truncate text-xs text-text-secondary">{agentName}</p>
                      <p className="truncate text-xs text-text-secondary">
                        {formatRunTime(run.runAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <StatusBadge status={run.status} />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 text-text-primary"
                        onClick={() => handleViewRun(run)}
                        aria-label={localize('com_ui_view')}
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {pausedSchedules.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-text-secondary">
            {localize('com_sidepanel_scheduled_agents_paused')}
          </p>
          <div className="space-y-2">
            {pausedSchedules.map((schedule) => {
              const nextRunText = getNextRunText(
                schedule,
                localize('com_sidepanel_scheduled_agents_completed'),
              );
              const agentName = agentsMap[schedule.agentId] ?? schedule.agentId;
              return (
                <div
                  key={schedule._id}
                  className="flex flex-col gap-1.5 rounded-lg border border-border-medium bg-surface-secondary p-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {schedule.name}
                      </p>
                      <p className="truncate text-xs text-text-secondary">{agentName}</p>
                      <p className="truncate text-xs text-text-secondary">
                        {localize('com_sidepanel_scheduled_agents_next_run')}: {nextRunText}
                      </p>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={schedule.enabled}
                        onCheckedChange={() => handleToggle(schedule)}
                        aria-label={`${schedule.name} enabled`}
                      />
                    </div>
                  </div>
                  <div
                    className="flex items-center justify-between gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-text-primary"
                        onClick={() => handleRun(schedule)}
                        disabled={runMutation.isLoading}
                        aria-label={localize('com_ui_run')}
                      >
                        <Play className="h-3 w-3" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 text-text-primary"
                        onClick={() => handleEdit(schedule)}
                      >
                        <Pencil className="mr-1 h-3 w-3" aria-hidden="true" />
                        {localize('com_ui_edit')}
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                      onClick={() => handleDeleteClick(schedule)}
                      disabled={deleteMutation.isLoading}
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="space-y-2 border-t border-border-medium pt-2">
        <p className="text-xs font-medium text-text-secondary">
          {localize('com_ui_dashboard_scheduled_quick_prompts')}
        </p>
        <div className="flex flex-col gap-2">
          {SAMPLE_PROMPTS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => handlePrompt(localize(key))}
              className="cursor-pointer rounded-lg border border-border-medium px-3 py-2 text-left text-sm text-text-secondary shadow-[0_0_2px_0_rgba(0,0,0,0.05),0_4px_6px_0_rgba(0,0,0,0.02)] transition-colors duration-300 hover:bg-surface-tertiary hover:text-text-primary"
            >
              &quot;{localize(key)}&quot;
            </button>
          ))}
        </div>
      </div>

      <OGDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setScheduleToDelete(null);
        }}
      >
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_ui_delete')}
          className="w-11/12 max-w-lg"
          main={
            scheduleToDelete && (
              <Label className="text-left text-sm font-medium">
                <Trans
                  i18nKey="com_sidepanel_scheduled_agents_delete_confirm"
                  values={{ name: scheduleToDelete.name }}
                  components={{ strong: <strong /> }}
                />
              </Label>
            )
          }
          selection={{
            selectHandler: confirmDelete,
            selectClasses:
              'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
            selectText: localize('com_ui_delete'),
          }}
        />
      </OGDialog>

      <OGDialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) handleFormClose();
        }}
      >
        <OGDialogTemplate
          title={localize('com_ui_edit')}
          className="max-h-[85vh] w-11/12 max-w-lg overflow-y-auto"
          showCloseButton
          showCancelButton={false}
          main={
            formOpen &&
            editingSchedule && (
              <ScheduleForm
                agents={agents}
                schedule={editingSchedule}
                onClose={handleFormClose}
                onSubmit={(data) => {
                  const payload = {
                    name: data.name,
                    agentId: data.agentId,
                    prompt: data.prompt.trim(),
                    scheduleType: data.scheduleType,
                    ...(data.scheduleType === 'recurring'
                      ? { cronExpression: data.cronExpression }
                      : { runAt: data.runAt }),
                    timezone: data.timezone || 'UTC',
                    ...(data.selectedTools !== undefined && {
                      selectedTools: data.selectedTools,
                    }),
                    emailOnComplete: data.emailOnComplete,
                    userProjectId: data.projectId || null,
                  };
                  const opts = {
                    onSuccess: handleFormSuccess,
                    onError: handleFormError,
                  };
                  if (editingSchedule) {
                    updateMutation.mutate({ id: editingSchedule._id, data: payload }, opts);
                  }
                }}
                isSubmitting={updateMutation.isLoading}
              />
            )
          }
        />
      </OGDialog>
    </CollapsibleWidget>
  );
}
