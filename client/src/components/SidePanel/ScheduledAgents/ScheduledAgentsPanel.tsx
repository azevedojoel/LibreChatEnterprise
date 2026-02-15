import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Play, Trash2, Clock, ExternalLink } from 'lucide-react';
import {
  Button,
  Spinner,
  Switch,
  useToastContext,
} from '@librechat/client';
import { PermissionBits } from 'librechat-data-provider';
import type { ScheduledAgentSchedule, ScheduledRun } from 'librechat-data-provider';
import {
  useGetScheduledAgentsQuery,
  useGetScheduledAgentRunsQuery,
  useCreateScheduledAgentMutation,
  useUpdateScheduledAgentMutation,
  useDeleteScheduledAgentMutation,
  useRunScheduledAgentMutation,
} from '~/data-provider';
import { useListAgentsQuery } from '~/data-provider/Agents';
import { useLocalize } from '~/hooks';
import ScheduleForm from './ScheduleForm';
import { cn } from '~/utils';

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
    pending: 'bg-gray-500/20 text-gray-600 dark:text-gray-400',
  };
  return (
    <span
      className={cn('rounded px-1.5 py-0.5 text-xs font-medium', colors[status] ?? 'bg-gray-500/20')}
    >
      {status}
    </span>
  );
}

export default function ScheduledAgentsPanel() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { showToast } = useToastContext();
  const [formOpen, setFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduledAgentSchedule | null>(null);

  const { data: schedules = [], isLoading: schedulesLoading } = useGetScheduledAgentsQuery();
  const { data: runs = [], isLoading: runsLoading } = useGetScheduledAgentRunsQuery(RUNS_LIMIT);
  const { data: agentsData } = useListAgentsQuery({
    limit: 100,
    requiredPermission: PermissionBits.VIEW,
  });

  const createMutation = useCreateScheduledAgentMutation({
    onSuccess: () => {
      setFormOpen(false);
      setEditingSchedule(null);
      showToast({ message: localize('com_ui_success'), status: 'success' });
    },
    onError: (err: Error) => {
      showToast({ message: err.message || localize('com_ui_error'), status: 'error' });
    },
  });

  const updateMutation = useUpdateScheduledAgentMutation({
    onSuccess: () => {
      setFormOpen(false);
      setEditingSchedule(null);
      showToast({ message: localize('com_ui_success'), status: 'success' });
    },
    onError: (err: Error) => {
      showToast({ message: err.message || localize('com_ui_error'), status: 'error' });
    },
  });

  const deleteMutation = useDeleteScheduledAgentMutation({
    onSuccess: () => {
      showToast({ message: localize('com_ui_success'), status: 'success' });
    },
    onError: (err: Error) => {
      showToast({ message: err.message || localize('com_ui_error'), status: 'error' });
    },
  });

  const runMutation = useRunScheduledAgentMutation({
    onSuccess: (res) => {
      if (res.success && res.conversationId) {
        navigate(`/c/${res.conversationId}`);
        showToast({ message: localize('com_ui_success'), status: 'success' });
      } else {
        showToast({ message: res.error || localize('com_ui_error'), status: 'error' });
      }
    },
    onError: (err: Error) => {
      showToast({ message: err.message || localize('com_ui_error'), status: 'error' });
    },
  });

  const agents = agentsData?.data ?? [];
  const agentsMap = Object.fromEntries(agents.map((a) => [a.id, a.name]));

  const handleToggle = (schedule: ScheduledAgentSchedule) => {
    updateMutation.mutate({ id: schedule._id, data: { enabled: !schedule.enabled } });
  };

  const handleEdit = (schedule: ScheduledAgentSchedule) => {
    setEditingSchedule(schedule);
    setFormOpen(true);
  };

  const handleViewRun = (run: ScheduledRun) => {
    navigate(`/c/${run.conversationId}`);
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditingSchedule(null);
  };

  if (schedulesLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-2">
      <div role="region" aria-label={localize('com_sidepanel_scheduled_agents')}>
        {/* Schedules header */}
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

        {/* Schedule list */}
        <div className="mt-2 space-y-2">
          {schedules.length === 0 ? (
            <p className="text-sm text-text-secondary">
              {localize('com_ui_no_conversation')}
            </p>
          ) : (
            schedules.map((schedule) => (
              <div
                key={schedule._id}
                className="flex flex-col gap-1 rounded-lg border border-border-medium bg-surface-primary p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {schedule.name}
                    </p>
                    <p className="truncate text-xs text-text-secondary">
                      {agentsMap[schedule.agentId] ?? schedule.agentId} • {schedule.scheduleType}
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
                    onClick={() => runMutation.mutate(schedule._id)}
                    disabled={runMutation.isPending}
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
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Recent runs */}
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-medium text-text-primary">
            {localize('com_ui_recent')}
          </h3>
          {runsLoading ? (
            <Spinner className="mx-auto my-4" />
          ) : runs.length === 0 ? (
            <p className="text-sm text-text-secondary">
              {localize('com_ui_no_conversation')}
            </p>
          ) : (
            <div className="space-y-1">
              {runs.map((run) => {
                const scheduleInfo =
                  run.scheduleId && typeof run.scheduleId === 'object'
                    ? run.scheduleId
                    : { name: 'Schedule', agentId: '' };
                return (
                  <div
                    key={run._id}
                    className="flex items-center justify-between gap-2 rounded border border-border-medium bg-surface-primary px-2 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-text-primary">
                        {scheduleInfo.name}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {formatRunTime(run.runAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={run.status} />
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
                );
              })}
            </div>
          )}
        </div>
      </div>

      {formOpen && (
        <ScheduleForm
          agents={agents}
          schedule={editingSchedule}
          onClose={handleFormClose}
          onSubmit={(data) => {
            const payload = {
              name: data.name,
              agentId: data.agentId,
              prompt: data.prompt,
              scheduleType: data.scheduleType,
              ...(data.scheduleType === 'recurring'
                ? { cronExpression: data.cronExpression }
                : { runAt: data.runAt }),
              timezone: data.timezone || 'UTC',
              ...(data.selectedTools !== undefined && { selectedTools: data.selectedTools }),
            };
            if (editingSchedule) {
              updateMutation.mutate({ id: editingSchedule._id, data: payload });
            } else {
              createMutation.mutate(payload);
            }
          }}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  );
}
