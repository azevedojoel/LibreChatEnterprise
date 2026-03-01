import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { Trans } from 'react-i18next';
import { Plus, Play, Trash2, ExternalLink, Loader2, Square, ChevronLeft } from 'lucide-react';
import {
  Button,
  Spinner,
  Switch,
  OGDialog,
  OGDialogTemplate,
  Label,
  useToastContext,
} from '@librechat/client';
import { PermissionBits, QueryKeys, dataService } from 'librechat-data-provider';
import type { ScheduledAgentSchedule, ScheduledRun, TConversation } from 'librechat-data-provider';
import {
  useGetScheduledAgentsQuery,
  useGetScheduledAgentRunsQuery,
  useCreateScheduledAgentMutation,
  useUpdateScheduledAgentMutation,
  useDeleteScheduledAgentMutation,
  useRunScheduledAgentMutation,
  useCancelScheduledRunMutation,
} from '~/data-provider';
import { useListAgentsQuery } from '~/data-provider/Agents';
import { useLocalize, useNavigateToConvo, type TranslationKeys } from '~/hooks';
import ScheduleForm from '~/components/SidePanel/ScheduledAgents/ScheduleForm';
import { ScheduledRunProgress } from '~/components/SidePanel/ScheduledAgents/ScheduledRunProgress';
import { cn } from '~/utils';
import store from '~/store';

const RUNS_LIMIT = 10;

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

const UNDO_DELAY_MS = 5000;

export default function ScheduledAgentsPanel() {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { navigateToConvo } = useNavigateToConvo(0);
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const { showToast } = useToastContext();
  const [formOpen, setFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduledAgentSchedule | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scheduleToDelete, setScheduleToDelete] = useState<ScheduledAgentSchedule | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: schedules = [], isLoading: schedulesLoading } = useGetScheduledAgentsQuery();
  const { data: runs = [], isLoading: runsLoading } = useGetScheduledAgentRunsQuery(RUNS_LIMIT);
  const { data: scheduleRuns = [], isLoading: scheduleRunsLoading } = useGetScheduledAgentRunsQuery(
    selectedScheduleId ? { scheduleId: selectedScheduleId, limit: 15 } : RUNS_LIMIT,
    { enabled: !!selectedScheduleId },
  );
  const { data: agentsData } = useListAgentsQuery({
    limit: 100,
    requiredPermission: PermissionBits.VIEW,
  });

  const createMutation = useCreateScheduledAgentMutation();
  const updateMutation = useUpdateScheduledAgentMutation();

  const handleFormSuccess = () => {
    setFormOpen(false);
    setEditingSchedule(null);
    showToast({ message: localize('com_ui_success'), status: 'success' });
  };

  const handleFormError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : localize('com_ui_error');
    showToast({ message: msg || localize('com_ui_error'), status: 'error' });
  };

  const deleteMutation = useDeleteScheduledAgentMutation();
  const runMutation = useRunScheduledAgentMutation();
  const cancelRunMutation = useCancelScheduledRunMutation();

  const handleDeleteSuccess = useCallback(() => {
    setPendingDeleteId(null);
    showToast({ message: localize('com_ui_success'), status: 'success' });
  }, [localize, showToast]);

  const handleDeleteError = useCallback(
    (err: unknown) => {
      setPendingDeleteId(null);
      const msg = err instanceof Error ? err.message : localize('com_ui_error');
      showToast({ message: msg, status: 'error' });
    },
    [localize, showToast],
  );

  const confirmDeleteSchedule = useCallback(() => {
    if (!scheduleToDelete) return;
    const id = scheduleToDelete._id;
    setPendingDeleteId(id);
    setDeleteDialogOpen(false);
    setScheduleToDelete(null);
    deleteTimeoutRef.current = setTimeout(() => {
      deleteTimeoutRef.current = null;
      deleteMutation.mutate(id, {
        onSuccess: handleDeleteSuccess,
        onError: handleDeleteError,
      });
    }, UNDO_DELAY_MS);
  }, [scheduleToDelete, deleteMutation, handleDeleteSuccess, handleDeleteError]);

  const handleUndoDelete = useCallback(() => {
    if (deleteTimeoutRef.current) {
      clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = null;
    }
    setPendingDeleteId(null);
    queryClient.invalidateQueries([QueryKeys.scheduledAgents]);
    queryClient.invalidateQueries([QueryKeys.scheduledAgentRuns]);
  }, [queryClient]);

  useEffect(() => {
    return () => {
      if (deleteTimeoutRef.current) {
        clearTimeout(deleteTimeoutRef.current);
      }
    };
  }, []);

  const handleRunSuccess = (res: {
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
  };

  const handleRunError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : localize('com_ui_error');
    showToast({ message: msg, status: 'error' });
  };

  const agents = agentsData?.data ?? [];
  const agentsMap = Object.fromEntries(agents.map((a) => [a.id, a.name]));

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

  const handleToggle = (schedule: ScheduledAgentSchedule) => {
    updateMutation.mutate({ id: schedule._id, data: { enabled: !schedule.enabled } });
  };

  const handleEdit = (schedule: ScheduledAgentSchedule, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSchedule(schedule);
    setFormOpen(true);
  };

  const handleViewRun = (run: ScheduledRun) => {
    if (run.conversationId) {
      queryClient.invalidateQueries([QueryKeys.messages, run.conversationId]);
      navigateToConvo({ conversationId: run.conversationId } as TConversation, {
        currentConvoId: conversation?.conversationId ?? undefined,
        resetLatestMessage: true,
      });
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

  const handleDeleteClick = (schedule: ScheduledAgentSchedule, e: React.MouseEvent) => {
    e.stopPropagation();
    setScheduleToDelete(schedule);
    setDeleteDialogOpen(true);
  };

  const displayedSchedules = useMemo(
    () => schedules.filter((s) => s._id !== pendingDeleteId),
    [schedules, pendingDeleteId],
  );

  const upcomingSchedules = useMemo(() => {
    return displayedSchedules
      .filter((s) => s.enabled && s.nextRunAt)
      .sort((a, b) => {
        const aTime = new Date(a.nextRunAt!).getTime();
        const bTime = new Date(b.nextRunAt!).getTime();
        return aTime - bTime;
      });
  }, [displayedSchedules]);

  const pausedSchedules = useMemo(
    () => displayedSchedules.filter((s) => !s.enabled),
    [displayedSchedules],
  );

  const queuedOrRunningRuns = useMemo(
    () => runs.filter((r) => r.status === 'queued' || r.status === 'running'),
    [runs],
  );

  const recentRuns = useMemo(
    () => runs.filter((r) => r.status === 'success' || r.status === 'failed'),
    [runs],
  );

  const selectedSchedule = useMemo(
    () => (selectedScheduleId ? schedules.find((s) => s._id === selectedScheduleId) : null),
    [selectedScheduleId, schedules],
  );

  if (schedulesLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <Spinner />
      </div>
    );
  }

  if (selectedScheduleId && selectedSchedule) {
    return (
      <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0"
            onClick={() => setSelectedScheduleId(null)}
            aria-label={localize('com_ui_back')}
          >
            <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
            {localize('com_ui_back')}
          </Button>
        </div>
        <div role="region" aria-label={localize('com_sidepanel_scheduled_agents_view_runs')}>
          <h3 className="mb-2 text-sm font-medium text-text-primary">
            {selectedSchedule.name} — {localize('com_sidepanel_scheduled_agents_view_runs')}
          </h3>
          {scheduleRunsLoading && <Spinner className="mx-auto my-4" />}
          {!scheduleRunsLoading && scheduleRuns.length === 0 && (
            <p className="text-sm text-text-secondary">
              {localize('com_sidepanel_scheduled_agents_no_recent_runs')}
            </p>
          )}
          {!scheduleRunsLoading && scheduleRuns.length > 0 && (
            <div className="space-y-1">
              {scheduleRuns.map((run) => (
                <div
                  key={run._id}
                  className="flex flex-col gap-1 rounded border border-border-medium bg-surface-primary px-2 py-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
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
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-2">
      <div role="region" aria-label={localize('com_sidepanel_scheduled_agents')}>
        <div className="flex items-center justify-between gap-2">
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
            aria-label={localize('com_ui_create')}
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            {localize('com_ui_create')}
          </Button>
        </div>

        {pendingDeleteId && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-[#02855E] bg-[#02855E]/20 px-3 py-2 text-sm">
            <span className="text-text-primary">
              {localize('com_sidepanel_scheduled_agents_deleted')}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 font-semibold underline"
              onClick={handleUndoDelete}
            >
              {localize('com_ui_undo')}
            </Button>
          </div>
        )}

        {formOpen && (
          <div className="mt-4">
            <ScheduleForm
              agents={agents}
              schedule={editingSchedule}
              onClose={handleFormClose}
              onSubmit={(data) => {
                const payload = {
                  name: data.name,
                  agentId: data.agentId,
                  promptGroupId: data.promptGroupId,
                  scheduleType: data.scheduleType,
                  ...(data.scheduleType === 'recurring'
                    ? { cronExpression: data.cronExpression }
                    : { runAt: data.runAt }),
                  timezone: data.timezone || 'UTC',
                  ...(data.selectedTools !== undefined && { selectedTools: data.selectedTools }),
                  emailOnComplete: data.emailOnComplete,
                };
                const opts = { onSuccess: handleFormSuccess, onError: handleFormError };
                if (editingSchedule) {
                  updateMutation.mutate({ id: editingSchedule._id, data: payload }, opts);
                } else {
                  createMutation.mutate(payload, opts);
                }
              }}
              isSubmitting={createMutation.isLoading || updateMutation.isLoading}
            />
          </div>
        )}

        {/* Upcoming section */}
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-medium text-text-primary">
            {localize('com_sidepanel_scheduled_agents_upcoming')}
          </h3>
          {upcomingSchedules.length === 0 && queuedOrRunningRuns.length === 0 ? (
            <p className="text-sm text-text-secondary">
              {localize('com_sidepanel_scheduled_agents_no_schedules')}
            </p>
          ) : (
            <div className="space-y-2">
              {upcomingSchedules.map((schedule) => (
                <ScheduleCard
                  key={schedule._id}
                  schedule={schedule}
                  resolvedAgentsMap={resolvedAgentsMap}
                  completedLabel={localize('com_sidepanel_scheduled_agents_completed')}
                  onToggle={() => handleToggle(schedule)}
                  onEdit={(e) => handleEdit(schedule, e)}
                  onDelete={(e) => handleDeleteClick(schedule, e)}
                  onRun={() =>
                    runMutation.mutate(schedule._id, {
                      onSuccess: handleRunSuccess,
                      onError: handleRunError,
                    })
                  }
                  onViewRuns={() => setSelectedScheduleId(schedule._id)}
                  runMutationLoading={runMutation.isLoading}
                  deleteMutationLoading={deleteMutation.isLoading}
                  localize={localize}
                />
              ))}
              {queuedOrRunningRuns.map((run) => {
                const scheduleInfo =
                  run.scheduleId && typeof run.scheduleId === 'object'
                    ? run.scheduleId
                    : { name: 'Schedule', agentId: '' };
                return (
                  <div
                    key={run._id}
                    className="flex flex-col gap-1 rounded-lg border border-border-medium bg-surface-primary p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {scheduleInfo.name}
                        </p>
                        <p className="truncate text-xs text-text-secondary">
                          {resolvedAgentsMap[scheduleInfo.agentId] ?? scheduleInfo.agentId}
                        </p>
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

        {/* Paused section */}
        {pausedSchedules.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-medium text-text-primary">
              {localize('com_sidepanel_scheduled_agents_paused')}
            </h3>
            <div className="space-y-2">
              {pausedSchedules.map((schedule) => (
                <ScheduleCard
                  key={schedule._id}
                  schedule={schedule}
                  resolvedAgentsMap={resolvedAgentsMap}
                  completedLabel={localize('com_sidepanel_scheduled_agents_completed')}
                  onToggle={() => handleToggle(schedule)}
                  onEdit={(e) => handleEdit(schedule, e)}
                  onDelete={(e) => handleDeleteClick(schedule, e)}
                  onRun={() =>
                    runMutation.mutate(schedule._id, {
                      onSuccess: handleRunSuccess,
                      onError: handleRunError,
                    })
                  }
                  onViewRuns={() => setSelectedScheduleId(schedule._id)}
                  runMutationLoading={runMutation.isLoading}
                  deleteMutationLoading={deleteMutation.isLoading}
                  localize={localize}
                />
              ))}
            </div>
          </div>
        )}

        {/* Recent runs section */}
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-medium text-text-primary">
            {localize('com_sidepanel_scheduled_agents_recent_runs')}
          </h3>
          {runsLoading && <Spinner className="mx-auto my-4" />}
          {!runsLoading && recentRuns.length === 0 && (
            <p className="text-sm text-text-secondary">
              {localize('com_sidepanel_scheduled_agents_no_recent_runs')}
            </p>
          )}
          {!runsLoading && recentRuns.length > 0 && (
            <div className="space-y-1">
              {recentRuns.map((run) => {
                const scheduleInfo =
                  run.scheduleId && typeof run.scheduleId === 'object'
                    ? run.scheduleId
                    : { name: 'Schedule', agentId: '' };
                return (
                  <div
                    key={run._id}
                    className="flex cursor-pointer flex-col gap-1 rounded border border-border-medium bg-surface-primary px-2 py-1.5 transition-colors hover:bg-surface-secondary"
                    onClick={() => handleViewRun(run)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleViewRun(run);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-text-primary">{scheduleInfo.name}</p>
                        <p className="text-xs text-text-secondary">{formatRunTime(run.runAt)}</p>
                      </div>
                      <StatusBadge status={run.status} />
                      <ExternalLink
                        className="h-3 w-3 shrink-0 text-text-secondary"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
            selectHandler: confirmDeleteSchedule,
            selectClasses:
              'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
            selectText: localize('com_ui_delete'),
          }}
        />
      </OGDialog>
    </div>
  );
}

type ScheduleCardProps = {
  schedule: ScheduledAgentSchedule;
  resolvedAgentsMap: Record<string, string>;
  completedLabel: string;
  onToggle: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onRun: () => void;
  onViewRuns: () => void;
  runMutationLoading: boolean;
  deleteMutationLoading: boolean;
  localize: (key: TranslationKeys) => string;
};

function ScheduleCard({
  schedule,
  resolvedAgentsMap,
  completedLabel,
  onToggle,
  onEdit,
  onDelete,
  onRun,
  onViewRuns,
  runMutationLoading,
  deleteMutationLoading,
  localize,
}: ScheduleCardProps) {
  const agentName = resolvedAgentsMap[schedule.agentId] ?? schedule.agentId;
  const nextRunText = getNextRunText(schedule, completedLabel);
  const lastRunText = schedule.lastRunAt
    ? `${formatRunTime(schedule.lastRunAt)} — ${schedule.lastRunStatus ?? '—'}`
    : '—';

  return (
    <div
      className="flex cursor-pointer flex-col gap-1 rounded-lg border border-border-medium bg-surface-primary p-2 transition-colors hover:bg-surface-secondary"
      onClick={onViewRuns}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onViewRuns();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">{schedule.name}</p>
          <p className="truncate text-xs text-text-secondary">{agentName}</p>
          <p className="truncate text-xs text-text-secondary">
            {localize('com_sidepanel_scheduled_agents_next_run')}: {nextRunText}
          </p>
          <p className="truncate text-xs text-text-secondary">
            {localize('com_sidepanel_scheduled_agents_last_run')}: {lastRunText}
          </p>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <Switch
            checked={schedule.enabled}
            onCheckedChange={onToggle}
            aria-label={`${schedule.name} enabled`}
          />
        </div>
      </div>
      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 flex-1"
          onClick={onRun}
          disabled={runMutationLoading}
        >
          <Play className="mr-1 h-3 w-3" aria-hidden="true" />
          {localize('com_ui_run')}
        </Button>
        <Button variant="ghost" size="sm" className="h-7" onClick={onEdit}>
          {localize('com_ui_edit')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-red-600 hover:text-red-700 dark:text-red-400"
          onClick={onDelete}
          disabled={deleteMutationLoading}
        >
          <Trash2 className="h-3 w-3" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
