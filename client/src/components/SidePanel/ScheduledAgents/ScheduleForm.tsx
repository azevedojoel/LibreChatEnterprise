import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Input, Label } from '@librechat/client';
import type { ScheduledAgentSchedule } from 'librechat-data-provider';
import type { Agent } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import ToolPicker from './ToolPicker';

export type ScheduleFormValues = {
  name: string;
  agentId: string;
  prompt: string;
  scheduleType: 'recurring' | 'one-off';
  cronExpression: string;
  runAt: string;
  timezone: string;
  selectedTools: string[] | null;
};

type Props = {
  agents: Agent[];
  schedule: ScheduledAgentSchedule | null;
  onClose: () => void;
  onSubmit: (data: ScheduleFormValues) => void;
  isSubmitting: boolean;
};

export default function ScheduleForm({
  agents,
  schedule,
  onClose,
  onSubmit,
  isSubmitting,
}: Props) {
  const localize = useLocalize();
  const isEdit = !!schedule;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ScheduleFormValues>({
    defaultValues: {
      name: '',
      agentId: '',
      prompt: '',
      scheduleType: 'recurring',
      cronExpression: '',
      runAt: '',
      timezone: 'UTC',
      selectedTools: null as string[] | null,
    },
  });

  const scheduleType = watch('scheduleType');

  useEffect(() => {
    if (schedule) {
      setValue('name', schedule.name);
      setValue('agentId', schedule.agentId);
      setValue('prompt', schedule.prompt);
      setValue('scheduleType', schedule.scheduleType);
      setValue('cronExpression', schedule.cronExpression ?? '');
      setValue('runAt', schedule.runAt ? new Date(schedule.runAt).toISOString().slice(0, 16) : '');
      setValue('timezone', schedule.timezone ?? 'UTC');
      setValue('selectedTools', schedule.selectedTools ?? null);
    }
  }, [schedule, setValue]);

  return (
    <div className="rounded-lg border border-border-medium bg-surface-primary p-3">
      <h4 className="mb-3 text-sm font-medium text-text-primary">
        {isEdit ? localize('com_ui_edit') : localize('com_ui_create')}
      </h4>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div>
          <Label htmlFor="schedule-name">{localize('com_ui_name')}</Label>
          <Input
            id="schedule-name"
            {...register('name', { required: true })}
            placeholder={localize('com_ui_name')}
            className="mt-1"
          />
          {errors.name && (
            <p className="mt-0.5 text-xs text-red-600">{localize('com_ui_required')}</p>
          )}
        </div>
        <div>
          <Label htmlFor="schedule-agent">{localize('com_ui_agent')}</Label>
          <select
            id="schedule-agent"
            {...register('agentId', { required: true })}
            className="mt-1 flex h-9 w-full rounded-md border border-border-medium bg-transparent px-3 py-1 text-sm"
          >
            <option value="">{localize('com_ui_select')}</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {errors.agentId && (
            <p className="mt-0.5 text-xs text-red-600">{localize('com_ui_required')}</p>
          )}
        </div>
        <div>
          <Label htmlFor="schedule-prompt">Prompt</Label>
          <textarea
            id="schedule-prompt"
            {...register('prompt', { required: true })}
            rows={3}
            placeholder="Enter the prompt to run..."
            className={cn(
              'mt-1 flex w-full rounded-md border border-border-medium bg-transparent px-3 py-2 text-sm',
            )}
          />
          {errors.prompt && (
            <p className="mt-0.5 text-xs text-red-600">{localize('com_ui_required')}</p>
          )}
        </div>
        <div>
          <Label>Schedule type</Label>
          <div className="mt-1 flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                value="recurring"
                {...register('scheduleType')}
                className="rounded"
              />
              <span className="text-sm">Recurring</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                value="one-off"
                {...register('scheduleType')}
                className="rounded"
              />
              <span className="text-sm">One-off</span>
            </label>
          </div>
        </div>
        {scheduleType === 'recurring' && (
          <div>
            <Label htmlFor="schedule-cron">Cron expression</Label>
            <Input
              id="schedule-cron"
              {...register('cronExpression', {
                required: scheduleType === 'recurring',
              })}
              placeholder="0 17 * * * (e.g. daily at 5pm)"
              className="mt-1"
            />
            {errors.cronExpression && (
              <p className="mt-0.5 text-xs text-red-600">{localize('com_ui_required')}</p>
            )}
          </div>
        )}
        {scheduleType === 'one-off' && (
          <div>
            <Label htmlFor="schedule-runat">Run at</Label>
            <Input
              id="schedule-runat"
              type="datetime-local"
              {...register('runAt', { required: scheduleType === 'one-off' })}
              className="mt-1"
            />
            {errors.runAt && (
              <p className="mt-0.5 text-xs text-red-600">{localize('com_ui_required')}</p>
            )}
          </div>
        )}
        <div>
          <Label htmlFor="schedule-timezone">Timezone</Label>
          <Input
            id="schedule-timezone"
            {...register('timezone')}
            placeholder="UTC"
            className="mt-1"
          />
        </div>
        {watch('agentId') && (
          <ToolPicker
            agentId={watch('agentId')}
            selectedTools={watch('selectedTools')}
            onChange={(v) => setValue('selectedTools', v)}
          />
        )}
        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? localize('com_ui_loading') : (isEdit ? localize('com_ui_save') : localize('com_ui_create'))}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            {localize('com_ui_cancel')}
          </Button>
        </div>
      </form>
    </div>
  );
}
