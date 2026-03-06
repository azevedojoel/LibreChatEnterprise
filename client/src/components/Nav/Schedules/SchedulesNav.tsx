import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trans } from 'react-i18next';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ExternalLink, Loader2, Pencil, Play, PlusIcon, Square, Trash2 } from 'lucide-react';
import { useRecoilState } from 'recoil';
import { Button, CircleHelpIcon, Label, OGDialog, OGDialogTemplate, Switch, TooltipAnchor, useToastContext } from '@librechat/client';
import { EModelEndpoint, PermissionBits, PermissionTypes, Permissions, QueryKeys, dataService } from 'librechat-data-provider';
import type { ScheduledAgentSchedule, ScheduledRun, TConversation } from 'librechat-data-provider';
import {
  useGetScheduledAgentsQuery,
  useGetScheduledAgentRunsQuery,
  useGetEndpointsQuery,
  useGetStartupConfig,
  useRunScheduledAgentMutation,
  useUpdateScheduledAgentMutation,
  useDeleteScheduledAgentMutation,
  useCancelScheduledRunMutation,
} from '~/data-provider';
import { useListAgentsQuery } from '~/data-provider/Agents';
import { useHasAccess, useLocalize, useNavigateToConvo } from '~/hooks';
import ScheduleForm from '~/components/SidePanel/ScheduledAgents/ScheduleForm';
import { ScheduledRunProgress } from '~/components/SidePanel/ScheduledAgents/ScheduledRunProgress';
import { cn, clearMessagesCache } from '~/utils';
import store from '~/store';

const SCHEDULES_HELP_HINT_ID = 'schedulesHelp';
const CREATE_SCHEDULE_PROMPT = 'Hey Ellis, I want to create a new schedule for ';
const RUNS_LIMIT = 5;

function formatShortTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function getNextRunText(schedule: ScheduledAgentSchedule, completedLabel: string): string {
  if (schedule.nextRunAt) {
    return formatShortTime(schedule.nextRunAt);
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
        'inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium',
        colors[status] ?? 'bg-gray-500/20',
      )}
    >
      {isActive && <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin" aria-hidden="true" />}
      {status}
    </span>
  );
}

export default function SchedulesNav() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const { navigateToConvo } = useNavigateToConvo(0);
  const { conversation } = store.useCreateConversationAtom(0);
  const [isExpanded, setIsExpanded] = useRecoilState(store.schedulesNavExpandedAtom);
  const [dismissedHelpHints, setDismissedHelpHints] = useRecoilState(
    store.dismissedHelpHintsAtom,
  );

  const { data: startupConfig } = useGetStartupConfig();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const hasAccessToAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });

  const interfaceConfig = startupConfig?.interface ?? {};
  const scheduledAgentsEnabled = interfaceConfig.scheduledAgents !== false;
  const agentsEndpointAvailable = !!endpointsConfig?.[EModelEndpoint.agents];
  const enabled =
    scheduledAgentsEnabled && agentsEndpointAvailable && hasAccessToAgents;

  const { data: schedules = [], isLoading: schedulesLoading } = useGetScheduledAgentsQuery(
    undefined,
    { enabled },
  );
  const { data: runs = [], isLoading: runsLoading } = useGetScheduledAgentRunsQuery(
    RUNS_LIMIT,
    { enabled },
  );
  const { data: agentsData } = useListAgentsQuery({
    limit: 100,
    requiredPermission: PermissionBits.VIEW,
  });

  const runMutation = useRunScheduledAgentMutation();
  const updateMutation = useUpdateScheduledAgentMutation();
  const deleteMutation = useDeleteScheduledAgentMutation();
  const cancelRunMutation = useCancelScheduledRunMutation();

  const [scheduleToDelete, setScheduleToDelete] = useState<ScheduledAgentSchedule | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduledAgentSchedule | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const agentsMap = useMemo(() => {
    const data = agentsData?.data ?? [];
    return Object.fromEntries(data.map((a) => [a.id, a.name]));
  }, [agentsData?.data]);

  const missingAgentIds = useMemo(() => {
    const scheduleIds = schedules.map((s) => s.agentId).filter((id): id is string => !!id);
    const runIds = runs
      .map((r) => (r.scheduleId && typeof r.scheduleId === 'object' ? r.scheduleId.agentId : null))
      .filter((id): id is string => !!id);
    const allIds = [...new Set([...scheduleIds, ...runIds])];
    return allIds.filter((id) => !agentsMap[id]);
  }, [schedules, runs, agentsMap]);

  const missingAgentQueries = useQueries({
    queries: missingAgentIds.map((agentId) => ({
      queryKey: [QueryKeys.agent, agentId],
      queryFn: () => dataService.getAgentById({ agent_id: agentId }),
      enabled: !!agentId,
      staleTime: 1000 * 60 * 5,
    })),
  });

  const resolvedAgentsMap = useMemo(() => {
    const resolved = { ...agentsMap } as Record<string, string>;
    missingAgentQueries.forEach((query) => {
      const agent = query.data;
      if (agent?.id && agent?.name) {
        resolved[agent.id] = agent.name;
      }
    });
    return resolved;
  }, [agentsMap, missingAgentQueries]);

  const handleCreateSchedulePrompt = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const prompt = encodeURIComponent(CREATE_SCHEDULE_PROMPT);
      navigate(`/c/new?prompt=${prompt}`, { state: { focusChat: true } });
    },
    [navigate],
  );

  const handleSchedulesHelp = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!dismissedHelpHints.includes(SCHEDULES_HELP_HINT_ID)) {
        setDismissedHelpHints([...dismissedHelpHints, SCHEDULES_HELP_HINT_ID]);
      }
      clearMessagesCache(queryClient, conversation?.conversationId);
      queryClient.invalidateQueries([QueryKeys.messages]);
      navigate('/c/new?autoStarter=schedules', { state: { focusChat: true } });
    },
    [
      dismissedHelpHints,
      setDismissedHelpHints,
      queryClient,
      conversation?.conversationId,
      navigate,
    ],
  );

  const handleRun = useCallback(
    (scheduleId: string) => {
      runMutation.mutate(scheduleId, {
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

  const handleToggle = useCallback(
    (schedule: ScheduledAgentSchedule) => {
      updateMutation.mutate({ id: schedule._id, data: { enabled: !schedule.enabled } });
    },
    [updateMutation],
  );

  const handleDeleteClick = useCallback(
    (schedule: ScheduledAgentSchedule, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setScheduleToDelete(schedule);
      setDeleteDialogOpen(true);
    },
    [],
  );

  const handleEditClick = useCallback(
    (schedule: ScheduledAgentSchedule, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setEditingSchedule(schedule);
      setEditDialogOpen(true);
    },
    [],
  );

  const handleEditFormClose = useCallback(() => {
    setEditDialogOpen(false);
    setEditingSchedule(null);
  }, []);

  const handleEditFormSuccess = useCallback(() => {
    setEditDialogOpen(false);
    setEditingSchedule(null);
    showToast({ message: localize('com_ui_success'), status: 'success' });
  }, [showToast, localize]);

  const handleEditFormError = useCallback(
    (err: unknown) => {
      let msg = localize('com_ui_error');
      if (err instanceof Error) {
        const axiosErr = err as { response?: { data?: { error?: string } } };
        msg = axiosErr.response?.data?.error ?? err.message;
      }
      showToast({ message: msg || localize('com_ui_error'), status: 'error' });
    },
    [showToast, localize],
  );

  const handleConfirmDelete = useCallback(() => {
    if (!scheduleToDelete) return;
    const id = scheduleToDelete._id;
    setDeleteDialogOpen(false);
    setScheduleToDelete(null);
    deleteMutation.mutate(id, {
      onSuccess: () => {
        showToast({ message: localize('com_sidepanel_scheduled_agents_deleted'), status: 'success' });
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : localize('com_ui_error');
        showToast({ message: msg, status: 'error' });
      },
    });
  }, [scheduleToDelete, deleteMutation, showToast, localize]);

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

  const upcomingSchedules = useMemo(
    () =>
      schedules
        .filter((s) => s.enabled && s.nextRunAt)
        .sort((a, b) => {
          const aTime = new Date(a.nextRunAt!).getTime();
          const bTime = new Date(b.nextRunAt!).getTime();
          return aTime - bTime;
        }),
    [schedules],
  );

  const pausedSchedules = useMemo(
    () => schedules.filter((s) => !s.enabled),
    [schedules],
  );

  const queuedOrRunningRuns = useMemo(
    () => runs.filter((r) => r.status === 'queued' || r.status === 'running'),
    [runs],
  );

  const recentRuns = useMemo(
    () => runs.filter((r) => r.status === 'success' || r.status === 'failed'),
    [runs],
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

  const completedLabel = localize('com_sidepanel_scheduled_agents_completed');

  if (!enabled) {
    return null;
  }

  return (
    <div className="mb-1">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="group flex w-full items-center justify-between rounded-lg px-1 py-2 text-sm font-bold text-text-secondary outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
        type="button"
      >
        <div className="flex items-center gap-0.5">
          <span className="select-none">{localize('com_ui_schedules')}</span>
          <TooltipAnchor
            description={localize('com_ui_schedules_help')}
            side="top"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleSchedulesHelp(e);
            }}
            render={
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className={cn(
                  'size-6 rounded p-0',
                  dismissedHelpHints.includes(SCHEDULES_HELP_HINT_ID)
                    ? 'opacity-0 group-hover:opacity-100'
                    : 'opacity-100',
                )}
                aria-label={localize('com_ui_schedules_help')}
              >
                <CircleHelpIcon className="size-3.5" />
              </Button>
            }
          />
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-6 rounded p-0 opacity-0 group-hover:opacity-100"
            onClick={handleCreateSchedulePrompt}
            aria-label={localize('com_ui_new_schedule')}
          >
            <PlusIcon className="size-3.5" />
          </Button>
          <ChevronDown
            className={cn('h-3 w-3 transition-transform duration-200', isExpanded ? 'rotate-180' : '')}
          />
        </div>
      </button>

      {isExpanded && (
        <div className="flex flex-col gap-1">
          {/* Schedules list */}
          <div className="max-h-52 overflow-y-auto">
            {schedulesLoading ? (
              <div className="px-2 py-1.5 text-sm text-text-secondary">
                {localize('com_ui_loading')}
              </div>
            ) : upcomingSchedules.length === 0 && pausedSchedules.length === 0 ? (
              <div className="px-2 py-1.5 text-sm text-text-secondary">
                {localize('com_sidepanel_scheduled_agents_no_schedules')}
              </div>
            ) : (
              <>
                {upcomingSchedules.map((schedule) => {
                  const agentName = resolvedAgentsMap[schedule.agentId] ?? schedule.agentId;
                  const nextRunText = getNextRunText(schedule, completedLabel);
                  return (
                    <div
                      key={schedule._id}
                      className="group flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left hover:bg-surface-hover"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-text-primary">
                          {schedule.name} · {agentName}
                        </p>
                        <p className="truncate text-xs text-text-secondary">{nextRunText}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-6 rounded p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRun(schedule._id);
                          }}
                          disabled={runMutation.isLoading}
                          aria-label={localize('com_ui_run')}
                        >
                          <Play className="size-3" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-6 rounded p-0 text-text-secondary hover:text-text-primary"
                          onClick={(e) => handleEditClick(schedule, e)}
                          disabled={updateMutation.isLoading}
                          aria-label={localize('com_ui_edit')}
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-6 rounded p-0 text-text-secondary hover:text-red-600"
                          onClick={(e) => handleDeleteClick(schedule, e)}
                          disabled={deleteMutation.isLoading}
                          aria-label={localize('com_ui_delete')}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                        <Switch
                          checked={schedule.enabled}
                          onCheckedChange={() => handleToggle(schedule)}
                          aria-label={`${schedule.name} enabled`}
                          className="scale-75"
                        />
                      </div>
                    </div>
                  );
                })}
                {pausedSchedules.map((schedule) => {
                  const agentName = resolvedAgentsMap[schedule.agentId] ?? schedule.agentId;
                  const nextRunText = getNextRunText(schedule, completedLabel);
                  return (
                    <div
                      key={schedule._id}
                      className="group flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left hover:bg-surface-hover"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-text-secondary">
                          {schedule.name} · {agentName}
                        </p>
                        <p className="truncate text-xs text-text-secondary">{nextRunText}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-6 rounded p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRun(schedule._id);
                          }}
                          disabled={runMutation.isLoading}
                          aria-label={localize('com_ui_run')}
                        >
                          <Play className="size-3" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-6 rounded p-0 text-text-secondary hover:text-text-primary"
                          onClick={(e) => handleEditClick(schedule, e)}
                          disabled={updateMutation.isLoading}
                          aria-label={localize('com_ui_edit')}
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-6 rounded p-0 text-text-secondary hover:text-red-600"
                          onClick={(e) => handleDeleteClick(schedule, e)}
                          disabled={deleteMutation.isLoading}
                          aria-label={localize('com_ui_delete')}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                        <Switch
                          checked={schedule.enabled}
                          onCheckedChange={() => handleToggle(schedule)}
                          aria-label={`${schedule.name} enabled`}
                          className="scale-75"
                        />
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Queued/Running runs with real-time feedback */}
          {queuedOrRunningRuns.length > 0 && (
            <div className="border-t border-surface-secondary pt-1">
              <p className="px-2 py-0.5 text-xs font-medium text-text-secondary">
                {localize('com_sidepanel_scheduled_agents_running')}
              </p>
              <div className="max-h-32 space-y-1 overflow-y-auto">
                {queuedOrRunningRuns.map((run) => {
                  const scheduleInfo =
                    run.scheduleId && typeof run.scheduleId === 'object'
                      ? run.scheduleId
                      : { name: 'Schedule', agentId: '' };
                  return (
                    <div
                      key={run._id}
                      className="flex flex-col gap-0.5 rounded-lg border border-border-medium bg-surface-primary px-2 py-1"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-text-primary">
                            {scheduleInfo.name}
                          </p>
                          <p className="truncate text-[11px] text-text-secondary">
                            {formatShortTime(run.runAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <StatusBadge status={run.status} />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-5 rounded p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelRun(run._id);
                            }}
                            disabled={
                              cancelRunMutation.isLoading && cancelRunMutation.variables === run._id
                            }
                            aria-label={localize('com_nav_stop_generating')}
                            title={localize('com_nav_stop_generating')}
                          >
                            {cancelRunMutation.isLoading && cancelRunMutation.variables === run._id ? (
                              <Loader2 className="size-2.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Square className="size-2.5" aria-hidden="true" fill="currentColor" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-5 rounded p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewRun(run);
                            }}
                            aria-label={localize('com_ui_view')}
                          >
                            <ExternalLink className="size-2.5 text-text-secondary" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                      {run.status === 'running' && run.conversationId && (
                        <ScheduledRunProgress
                          runId={run._id}
                          streamId={run.conversationId}
                          status={run.status}
                          className="text-xs py-0.5"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent runs */}
          <div className="border-t border-surface-secondary pt-1">
            <p className="px-2 py-0.5 text-sm font-medium text-text-secondary">
              {localize('com_sidepanel_scheduled_agents_recent_runs')}
            </p>
            {runsLoading ? (
              <div className="px-2 py-1 text-sm text-text-secondary">
                {localize('com_ui_loading')}
              </div>
            ) : recentRuns.length === 0 ? (
              <div className="px-2 py-1 text-sm text-text-secondary">
                {localize('com_sidepanel_scheduled_agents_no_recent_runs')}
              </div>
            ) : (
              <div className="max-h-24 overflow-y-auto">
                {recentRuns.map((run) => {
                  const scheduleInfo =
                    run.scheduleId && typeof run.scheduleId === 'object'
                      ? run.scheduleId
                      : { name: 'Schedule', agentId: '' };
                  return (
                    <button
                      key={run._id}
                      type="button"
                      onClick={() => handleViewRun(run)}
                      className="group flex w-full items-center gap-1 rounded-lg px-2 py-1 text-left hover:bg-surface-hover"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-text-primary">
                          {scheduleInfo.name} · {run.status}
                        </p>
                        <p className="truncate text-xs text-text-secondary">
                          {formatShortTime(run.runAt)}
                        </p>
                      </div>
                      <ExternalLink className="size-3 shrink-0 opacity-0 group-hover:opacity-100 text-text-secondary" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

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
            selectHandler: handleConfirmDelete,
            selectClasses:
              'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
            selectText: localize('com_ui_delete'),
          }}
        />
      </OGDialog>

      <OGDialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setEditingSchedule(null);
        }}
      >
        <OGDialogTemplate
          showCloseButton
          showCancelButton={false}
          title={localize('com_ui_edit')}
          className="w-11/12 max-w-lg max-h-[90vh] overflow-y-auto"
          main={
            editingSchedule && (
              <div className="max-h-[calc(90vh-8rem)] overflow-y-auto">
                <ScheduleForm
                  key={editingSchedule._id}
                  agents={agentsData?.data ?? []}
                  schedule={editingSchedule}
                  onClose={handleEditFormClose}
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
                      ...(data.selectedTools !== undefined && { selectedTools: data.selectedTools }),
                      emailOnComplete: data.emailOnComplete,
                      userProjectId: data.projectId || null,
                    };
                    updateMutation.mutate(
                      { id: editingSchedule._id, data: payload },
                      {
                        onSuccess: handleEditFormSuccess,
                        onError: handleEditFormError,
                      },
                    );
                  }}
                  isSubmitting={updateMutation.isLoading}
                />
              </div>
            )
          }
        />
      </OGDialog>
    </div>
  );
}
