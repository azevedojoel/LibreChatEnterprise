import { useState, useCallback } from 'react';
import { Plus, Play, Trash2, Clock } from 'lucide-react';
import cronstrue from 'cronstrue';
import {
  Button,
  OGDialog,
  OGDialogContent,
  Spinner,
  Switch,
  useToastContext,
} from '@librechat/client';
import type { TWorkflowSchedule } from 'librechat-data-provider';
import {
  useGetWorkflowSchedulesQuery,
  useCreateWorkflowScheduleMutation,
  useUpdateWorkflowScheduleMutation,
  useDeleteWorkflowScheduleMutation,
  useRunWorkflowScheduleMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import WorkflowScheduleForm from './WorkflowScheduleForm';
import type { WorkflowScheduleFormValues } from './WorkflowScheduleForm';
import { useGetStartupConfig } from '~/data-provider';

function formatRunTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function getScheduleDescription(schedule: TWorkflowSchedule): string {
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

function getNextRunText(schedule: TWorkflowSchedule, completedLabel: string): string {
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

type WorkflowScheduleSectionProps = {
  workflowId: string;
  isValid: boolean;
  canRunOrSchedule?: boolean;
};

export default function WorkflowScheduleSection({
  workflowId,
  isValid,
  canRunOrSchedule = true,
}: WorkflowScheduleSectionProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [formOpen, setFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<TWorkflowSchedule | null>(null);

  const { data: startupConfig } = useGetStartupConfig();
  const interfaceConfig = startupConfig?.interface ?? {};
  const scheduledAgentsEnabled = interfaceConfig.scheduledAgents !== false;

  const shouldShow = scheduledAgentsEnabled && !!workflowId;

  const { data: schedules = [], isLoading: schedulesLoading } = useGetWorkflowSchedulesQuery(
    workflowId,
    { enabled: shouldShow },
  );

  const createMutation = useCreateWorkflowScheduleMutation();
  const updateMutation = useUpdateWorkflowScheduleMutation();
  const deleteMutation = useDeleteWorkflowScheduleMutation();
  const runMutation = useRunWorkflowScheduleMutation();

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
    (res: { success: boolean; conversationId?: string; error?: string }) => {
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

  const handleToggle = (schedule: TWorkflowSchedule) => {
    updateMutation.mutate({
      workflowId,
      scheduleId: schedule._id,
      data: { enabled: !schedule.enabled },
    });
  };

  const handleEdit = (schedule: TWorkflowSchedule) => {
    setEditingSchedule(schedule);
    setFormOpen(true);
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditingSchedule(null);
  };

  const handleFormSubmit = useCallback(
    (data: WorkflowScheduleFormValues) => {
      const payload = {
        name: data.name,
        scheduleType: data.scheduleType,
        ...(data.scheduleType === 'recurring'
          ? { cronExpression: data.cronExpression }
          : { runAt: data.runAt }),
        timezone: data.timezone || 'UTC',
      };
      const opts = { onSuccess: handleFormSuccess, onError: handleFormError };
      if (editingSchedule) {
        updateMutation.mutate(
          { workflowId, scheduleId: editingSchedule._id, data: payload },
          opts,
        );
      } else {
        createMutation.mutate({ workflowId, data: payload }, opts);
      }
    },
    [
      workflowId,
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

  const actionsDisabled = !isValid || !canRunOrSchedule;

  return (
    <div
      className="mb-4 rounded border border-border-light bg-surface-secondary p-2"
      role="region"
      aria-label={localize('com_ui_workflows_schedule')}
    >
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-text-secondary">
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        {localize('com_ui_workflows_schedule')}
      </h4>

      {schedulesLoading && (
        <div className="flex justify-center py-4">
          <Spinner className="h-5 w-5" />
        </div>
      )}
      {!schedulesLoading && schedules.length === 0 && (
        <p className="py-2 text-center text-xs text-text-tertiary">
          {localize('com_ui_workflows_no_schedules')}
        </p>
      )}
      {!schedulesLoading && schedules.length > 0 && (
        <div className="space-y-1.5">
          {schedules.map((schedule) => (
            <div
              key={schedule._id}
              className="flex flex-col gap-1 rounded border border-border-medium bg-surface-primary p-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-text-primary">{schedule.name}</p>
                  <p className="truncate text-[11px] text-text-tertiary">
                    {schedule.scheduleType} • {getScheduleDescription(schedule)}
                  </p>
                  <p className="truncate text-[11px] text-text-tertiary">
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
                  className="scale-75"
                />
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 flex-1 text-xs"
                  onClick={() =>
                    runMutation.mutate(
                      { workflowId, scheduleId: schedule._id },
                      {
                        onSuccess: handleRunSuccess,
                        onError: handleRunError,
                      },
                    )
                  }
                  disabled={runMutation.isLoading || !canRunOrSchedule}
                  title={!canRunOrSchedule ? localize('com_ui_workflows_save_first') : undefined}
                >
                  <Play className="mr-1 h-3 w-3" aria-hidden="true" />
                  {localize('com_ui_run')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => handleEdit(schedule)}
                >
                  {localize('com_ui_edit')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-red-600 hover:text-red-700 dark:text-red-400"
                  onClick={() =>
                    deleteMutation.mutate({ workflowId, scheduleId: schedule._id })
                  }
                  disabled={deleteMutation.isLoading}
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button
        variant="default"
        size="lg"
        className="mt-3 w-full py-3 text-base font-medium"
        onClick={() => {
          setEditingSchedule(null);
          setFormOpen(true);
        }}
        disabled={actionsDisabled}
        title={!canRunOrSchedule ? localize('com_ui_workflows_save_first') : undefined}
        aria-label={localize('com_ui_workflows_schedule')}
      >
        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
        {localize('com_ui_workflows_schedule')}
      </Button>

      <OGDialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) handleFormClose();
        }}
      >
        <OGDialogContent
          className="max-h-[90vh] w-full max-w-lg overflow-y-auto"
          showCloseButton={true}
        >
          <WorkflowScheduleForm
            schedule={editingSchedule}
            onClose={handleFormClose}
            onSubmit={handleFormSubmit}
            isSubmitting={createMutation.isLoading || updateMutation.isLoading}
          />
        </OGDialogContent>
      </OGDialog>
    </div>
  );
}
