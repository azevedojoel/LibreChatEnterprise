import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Button, Input, Label, useToastContext } from '@librechat/client';
import type { TWorkflowSchedule } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import SimpleRecurrencePicker from '~/components/SidePanel/ScheduledAgents/SimpleRecurrencePicker';
import { cn } from '~/utils';

const US_TIMEZONES: { value: string; label: string }[] = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
];

export type WorkflowScheduleFormValues = {
  name: string;
  scheduleType: 'recurring' | 'one-off';
  cronExpression: string;
  runAt: string;
  timezone: string;
};

const fieldStyles =
  'h-10 w-full rounded-lg border border-border-medium bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50';

type Props = {
  schedule: TWorkflowSchedule | null;
  onClose: () => void;
  onSubmit: (data: WorkflowScheduleFormValues) => void;
  isSubmitting: boolean;
};

export default function WorkflowScheduleForm({
  schedule,
  onClose,
  onSubmit,
  isSubmitting,
}: Props) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const isEdit = !!schedule;

  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    formState: { errors },
  } = useForm<WorkflowScheduleFormValues>({
    mode: 'onTouched',
    defaultValues: {
      name: '',
      scheduleType: 'recurring',
      cronExpression: '0 9 * * *',
      runAt: '',
      timezone: 'UTC',
    },
  });

  const scheduleType = watch('scheduleType');
  const cronExpression = watch('cronExpression');

  useEffect(() => {
    if (schedule) {
      const validTimezone: string =
        schedule.timezone && US_TIMEZONES.some((tz) => tz.value === schedule.timezone)
          ? schedule.timezone
          : 'UTC';
      setValue('name', schedule.name);
      setValue('scheduleType', schedule.scheduleType);
      setValue('cronExpression', schedule.cronExpression ?? '0 9 * * *');
      setValue(
        'runAt',
        schedule.runAt ? new Date(schedule.runAt).toISOString().slice(0, 16) : '',
      );
      setValue('timezone', schedule.timezone ? validTimezone : 'UTC');
    }
  }, [schedule, setValue]);

  useEffect(() => {
    if (!schedule && scheduleType === 'recurring' && (!cronExpression || cronExpression === '')) {
      setValue('cronExpression', '0 9 * * *');
    }
  }, [schedule, scheduleType, cronExpression, setValue]);

  return (
    <div className="space-y-5">
      <h3 className="text-base font-semibold leading-tight">
        {isEdit ? localize('com_ui_edit') : localize('com_ui_create')}
      </h3>
      <form
        onSubmit={handleSubmit(onSubmit, (formErrors) => {
          const firstError = Object.values(formErrors)[0];
          const message =
            firstError?.message && typeof firstError.message === 'string'
              ? firstError.message
              : localize('com_ui_required');
          showToast({ message, status: 'error' });
        })}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="workflow-schedule-name" className="text-sm font-medium">
            {localize('com_ui_name')}
          </Label>
          <Input
            id="workflow-schedule-name"
            {...register('name', { required: true })}
            placeholder={localize('com_ui_name')}
            className={fieldStyles}
          />
          {errors.name && (
            <p className="text-xs text-destructive">{localize('com_ui_required')}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">
            {localize('com_sidepanel_scheduled_agents_schedule_type')}
          </Label>
          <div className="flex gap-6">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                value="recurring"
                {...register('scheduleType')}
                className="h-4 w-4 rounded-full border-border-medium"
              />
              <span className="text-sm">
                {localize('com_sidepanel_scheduled_agents_recurring')}
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                value="one-off"
                {...register('scheduleType')}
                className="h-4 w-4 rounded-full border-border-medium"
              />
              <span className="text-sm">{localize('com_sidepanel_scheduled_agents_one_off')}</span>
            </label>
          </div>
        </div>

        {scheduleType === 'recurring' && (
          <div className="space-y-2">
            <Label htmlFor="workflow-schedule-cron" className="text-sm font-medium">
              {localize('com_sidepanel_scheduled_agents_schedule')}
            </Label>
            <Controller
              name="cronExpression"
              control={control}
              rules={{ required: true }}
              render={({ field }) => (
                <SimpleRecurrencePicker
                  value={field.value || '0 9 * * *'}
                  onChange={field.onChange}
                />
              )}
            />
            {errors.cronExpression && (
              <p className="text-xs text-destructive">{localize('com_ui_required')}</p>
            )}
          </div>
        )}

        {scheduleType === 'one-off' && (
          <div className="space-y-2">
            <Label htmlFor="workflow-schedule-runat" className="text-sm font-medium">
              {localize('com_sidepanel_scheduled_agents_run_at')}
            </Label>
            <Input
              id="workflow-schedule-runat"
              type="datetime-local"
              {...register('runAt', { required: scheduleType === 'one-off' })}
              className={fieldStyles}
            />
            {errors.runAt && (
              <p className="text-xs text-destructive">{localize('com_ui_required')}</p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="workflow-schedule-timezone" className="text-sm font-medium">
            {localize('com_sidepanel_scheduled_agents_timezone')}
          </Label>
          <select
            id="workflow-schedule-timezone"
            {...register('timezone')}
            className={cn(fieldStyles, 'appearance-none')}
          >
            {US_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {localize('com_ui_cancel')}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && localize('com_ui_loading')}
            {!isSubmitting && isEdit && localize('com_ui_save')}
            {!isSubmitting && !isEdit && localize('com_ui_create')}
          </Button>
        </div>
      </form>
    </div>
  );
}
