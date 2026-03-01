import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Button, Input, Label, useToastContext } from '@librechat/client';

const US_TIMEZONES: { value: string; label: string }[] = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
];
import type { ScheduledAgentSchedule } from 'librechat-data-provider';
import type { Agent } from 'librechat-data-provider';
import { useGetAllPromptGroups } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import ToolPicker from './ToolPicker';
import SimpleRecurrencePicker from './SimpleRecurrencePicker';

export type ScheduleFormValues = {
  name: string;
  agentId: string;
  promptGroupId: string;
  scheduleType: 'recurring' | 'one-off';
  cronExpression: string;
  runAt: string;
  timezone: string;
  selectedTools: string[] | null;
  emailOnComplete: boolean;
};

type Props = {
  agents: Agent[];
  schedule: ScheduledAgentSchedule | null;
  onClose: () => void;
  onSubmit: (data: ScheduleFormValues) => void;
  isSubmitting: boolean;
  /** When set, prompt is fixed to this group - hide prompt selector and use this ID */
  fixedPromptGroupId?: string;
};

export default function ScheduleForm({
  agents,
  schedule,
  onClose,
  onSubmit,
  isSubmitting,
  fixedPromptGroupId,
}: Props) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const isEdit = !!schedule;
  const { data: promptGroups = [] } = useGetAllPromptGroups();

  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    formState: { errors },
  } = useForm<ScheduleFormValues>({
    mode: 'onTouched',
    defaultValues: {
      name: '',
      agentId: '',
      promptGroupId: fixedPromptGroupId ?? '',
      scheduleType: 'recurring',
      cronExpression: '',
      runAt: '',
      timezone: 'UTC',
      selectedTools: null as string[] | null,
      emailOnComplete: true,
    },
  });

  const scheduleType = watch('scheduleType');
  const cronExpression = watch('cronExpression');

  useEffect(() => {
    if (fixedPromptGroupId) {
      setValue('promptGroupId', fixedPromptGroupId);
    }
  }, [fixedPromptGroupId, setValue]);

  useEffect(() => {
    if (schedule) {
      const validTimezone: string =
        schedule.timezone && US_TIMEZONES.some((tz) => tz.value === schedule.timezone)
          ? schedule.timezone
          : 'UTC';
      setValue('name', schedule.name);
      setValue('agentId', schedule.agentId);
      setValue(
        'promptGroupId',
        typeof schedule.promptGroupId === 'object' && schedule.promptGroupId?._id
          ? schedule.promptGroupId._id
          : (typeof schedule.promptGroupId === 'string' ? schedule.promptGroupId : '') ?? '',
      );
      setValue('scheduleType', schedule.scheduleType);
      setValue('cronExpression', schedule.cronExpression ?? '');
      setValue('runAt', schedule.runAt ? new Date(schedule.runAt).toISOString().slice(0, 16) : '');
      setValue('timezone', schedule.timezone ? validTimezone : 'UTC');
      setValue('selectedTools', schedule.selectedTools ?? null);
      setValue('emailOnComplete', schedule.emailOnComplete !== false);
    }
  }, [schedule, setValue]);

  useEffect(() => {
    if (!schedule && scheduleType === 'recurring' && (!cronExpression || cronExpression === '')) {
      setValue('cronExpression', '0 9 * * *');
    }
  }, [schedule, scheduleType, cronExpression, setValue]);

  return (
    <div className="rounded-lg border border-border-medium bg-surface-primary p-3">
      <h4 className="mb-3 text-sm font-medium text-text-primary">
        {isEdit ? localize('com_ui_edit') : localize('com_ui_create')}
      </h4>
      <form
        onSubmit={handleSubmit(onSubmit, (errors) => {
          const firstError = Object.values(errors)[0];
          const message =
            firstError?.message && typeof firstError.message === 'string'
              ? firstError.message
              : localize('com_ui_required');
          showToast({ message, status: 'error' });
        })}
        className="space-y-3"
      >
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
        {!fixedPromptGroupId && (
          <div>
            <Label htmlFor="schedule-prompt">
              {localize('com_sidepanel_scheduled_agents_prompt')}
            </Label>
            <select
              id="schedule-prompt"
              {...register('promptGroupId', { required: !fixedPromptGroupId })}
              className={cn(
                'mt-1 flex h-9 w-full rounded-md border border-border-medium bg-transparent px-3 py-1 text-sm',
              )}
            >
              <option value="">{localize('com_ui_select')}</option>
              {promptGroups.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name}
                </option>
              ))}
            </select>
            {errors.promptGroupId && (
              <p className="mt-0.5 text-xs text-red-600">{localize('com_ui_required')}</p>
            )}
          </div>
        )}
        <div>
          <Label>{localize('com_sidepanel_scheduled_agents_schedule_type')}</Label>
          <div className="mt-1 flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                value="recurring"
                {...register('scheduleType')}
                className="rounded"
              />
              <span className="text-sm">
                {localize('com_sidepanel_scheduled_agents_recurring')}
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                value="one-off"
                {...register('scheduleType')}
                className="rounded"
              />
              <span className="text-sm">{localize('com_sidepanel_scheduled_agents_one_off')}</span>
            </label>
          </div>
        </div>
        {scheduleType === 'recurring' && (
          <div>
            <Label htmlFor="schedule-cron">
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
              <p className="mt-0.5 text-xs text-red-600">{localize('com_ui_required')}</p>
            )}
          </div>
        )}
        {scheduleType === 'one-off' && (
          <div>
            <Label htmlFor="schedule-runat">
              {localize('com_sidepanel_scheduled_agents_run_at')}
            </Label>
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
          <Label htmlFor="schedule-timezone">
            {localize('com_sidepanel_scheduled_agents_timezone')}
          </Label>
          <select
            id="schedule-timezone"
            {...register('timezone')}
            className="mt-1 flex h-9 w-full rounded-md border border-border-medium bg-transparent px-3 py-1 text-sm"
          >
            {US_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Controller
            name="emailOnComplete"
            control={control}
            render={({ field }) => (
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                  className="rounded"
                  aria-label={localize('com_sidepanel_scheduled_agents_email_on_complete')}
                />
                <span className="text-sm text-text-primary">
                  {localize('com_sidepanel_scheduled_agents_email_on_complete')}
                </span>
              </label>
            )}
          />
        </div>
        {watch('agentId') && (
          <Controller
            name="selectedTools"
            control={control}
            defaultValue={null}
            render={({ field }) => (
              <ToolPicker
                agentId={watch('agentId')}
                selectedTools={field.value}
                onChange={field.onChange}
              />
            )}
          />
        )}
        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && localize('com_ui_loading')}
            {!isSubmitting && isEdit && localize('com_ui_save')}
            {!isSubmitting && !isEdit && localize('com_ui_create')}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            {localize('com_ui_cancel')}
          </Button>
        </div>
      </form>
    </div>
  );
}
