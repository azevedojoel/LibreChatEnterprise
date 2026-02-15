import { useCallback, useState } from 'react';
import { Input, Label } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export type Frequency = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'custom';

const WEEKDAYS = [
  { value: 0, short: 'Sun' },
  { value: 1, short: 'Mon' },
  { value: 2, short: 'Tue' },
  { value: 3, short: 'Wed' },
  { value: 4, short: 'Thu' },
  { value: 5, short: 'Fri' },
  { value: 6, short: 'Sat' },
];

type State = {
  frequency: Frequency;
  hour: number;
  minute: number;
  weekDays: number[];
  monthDay: number;
  customCron: string;
};

function stateToCron(state: State): string {
  const min = state.minute;
  const hour = state.hour;
  if (state.frequency === 'custom') {
    return state.customCron.trim() || '0 9 * * *';
  }
  if (state.frequency === 'daily') {
    return `${min} ${hour} * * *`;
  }
  if (state.frequency === 'weekdays') {
    return `${min} ${hour} * * 1-5`;
  }
  if (state.frequency === 'weekly') {
    const days = state.weekDays.length > 0 ? state.weekDays : [1];
    const dow = [...days].sort((a, b) => a - b).join(',');
    return `${min} ${hour} * * ${dow}`;
  }
  if (state.frequency === 'monthly') {
    return `${min} ${hour} ${state.monthDay} * *`;
  }
  return '0 9 * * *';
}

function cronToState(cron: string): State {
  const trimmed = cron?.trim() || '';
  if (!trimmed) {
    return {
      frequency: 'daily',
      hour: 9,
      minute: 0,
      weekDays: [],
      monthDay: 1,
      customCron: '',
    };
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length < 5) {
    return { frequency: 'custom', hour: 9, minute: 0, weekDays: [], monthDay: 1, customCron: trimmed };
  }

  const min = parseInt(parts[0], 10);
  const hour = parseInt(parts[1], 10);
  const dom = parts[2];
  const month = parts[3];
  const dow = parts[4];

  if (isNaN(min) || isNaN(hour)) {
    return { frequency: 'custom', hour: 9, minute: 0, weekDays: [], monthDay: 1, customCron: trimmed };
  }

  if (dom === '*' && month === '*' && dow === '*') {
    return { frequency: 'daily', hour, minute: min, weekDays: [], monthDay: 1, customCron: '' };
  }

  if (dom === '*' && month === '*' && dow === '1-5') {
    return { frequency: 'weekdays', hour, minute: min, weekDays: [], monthDay: 1, customCron: '' };
  }

  if (dom === '*' && month === '*' && /^[0-6](,[0-6])*$/.test(dow)) {
    const weekDays = dow.split(',').map((d) => parseInt(d, 10));
    return { frequency: 'weekly', hour, minute: min, weekDays, monthDay: 1, customCron: '' };
  }

  if (month === '*' && dow === '*' && /^\d{1,2}$/.test(dom)) {
    const d = parseInt(dom, 10);
    if (d >= 1 && d <= 31) {
      return { frequency: 'monthly', hour, minute: min, weekDays: [], monthDay: d, customCron: '' };
    }
  }

  return { frequency: 'custom', hour: 9, minute: 0, weekDays: [], monthDay: 1, customCron: trimmed };
}

type Props = {
  value: string;
  onChange: (cron: string) => void;
};

export default function SimpleRecurrencePicker({ value, onChange }: Props) {
  const localize = useLocalize();
  const [explicitCustom, setExplicitCustom] = useState(false);

  const parsed = cronToState(value || '0 9 * * *');
  const effectiveFrequency = explicitCustom ? 'custom' : parsed.frequency;
  const state: State = {
    ...parsed,
    frequency: effectiveFrequency,
    customCron:
      effectiveFrequency === 'custom' && !parsed.customCron
        ? (value || '0 9 * * *')
        : parsed.customCron,
  };

  const notify = useCallback(
    (s: State) => {
      onChange(stateToCron(s));
    },
    [onChange],
  );

  const setFrequency = (f: Frequency) => {
    setExplicitCustom(f === 'custom');
    const next: State = { ...state, frequency: f };
    if (f === 'custom') next.customCron = value || '0 9 * * *';
    if (f === 'weekly' && next.weekDays.length === 0) next.weekDays = [1];
    notify(next);
  };

  const setTime = (hour: number, minute: number) => {
    notify({ ...state, hour, minute });
  };

  const toggleWeekDay = (d: number) => {
    const set = new Set(state.weekDays);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    const weekDays = Array.from(set);
    notify({ ...state, weekDays });
  };

  const setMonthDay = (d: number) => {
    notify({ ...state, monthDay: d });
  };

  const setCustomCron = (v: string) => {
    notify({ ...state, customCron: v });
  };

  const timeValue = `${String(state.hour).padStart(2, '0')}:${String(state.minute).padStart(2, '0')}`;

  return (
    <div className="mt-1 space-y-3 rounded-md border border-border-medium bg-surface-primary p-3">
      <div>
        <Label className="text-xs">{localize('com_sidepanel_scheduled_agents_frequency')}</Label>
        <select
          value={state.frequency}
          onChange={(e) => setFrequency(e.target.value as Frequency)}
          className="mt-1 flex h-9 w-full rounded-md border border-border-medium bg-transparent px-3 py-1 text-sm"
        >
          <option value="daily">{localize('com_sidepanel_scheduled_agents_daily')}</option>
          <option value="weekdays">{localize('com_sidepanel_scheduled_agents_weekdays')}</option>
          <option value="weekly">{localize('com_sidepanel_scheduled_agents_weekly')}</option>
          <option value="monthly">{localize('com_sidepanel_scheduled_agents_monthly')}</option>
          <option value="custom">{localize('com_sidepanel_scheduled_agents_custom')}</option>
        </select>
      </div>

      {state.frequency !== 'custom' && (
        <div>
          <Label className="text-xs">{localize('com_sidepanel_scheduled_agents_at')}</Label>
          <Input
            type="time"
            value={timeValue}
            onChange={(e) => {
              const [h, m] = e.target.value.split(':').map(Number);
              setTime(h, m);
            }}
            className="mt-1"
          />
        </div>
      )}

      {state.frequency === 'weekly' && (
        <div>
          <Label className="text-xs">{localize('com_sidepanel_scheduled_agents_on_days')}</Label>
          <div className="mt-1 flex flex-wrap gap-2">
            {WEEKDAYS.map(({ value: d, short }) => (
              <label
                key={d}
                className={cn(
                  'flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-xs',
                  state.weekDays.includes(d)
                    ? 'border-surface-submit bg-surface-submit/20 text-text-primary'
                    : 'border-border-medium',
                )}
              >
                <input
                  type="checkbox"
                  checked={state.weekDays.includes(d)}
                  onChange={() => toggleWeekDay(d)}
                  className="rounded"
                />
                {short}
              </label>
            ))}
          </div>
        </div>
      )}

      {state.frequency === 'monthly' && (
        <div>
          <Label className="text-xs">{localize('com_sidepanel_scheduled_agents_on_day_of_month')}</Label>
          <select
            value={state.monthDay}
            onChange={(e) => setMonthDay(parseInt(e.target.value, 10))}
            className="mt-1 flex h-9 w-full rounded-md border border-border-medium bg-transparent px-3 py-1 text-sm"
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      )}

      {state.frequency === 'custom' && (
        <div>
          <Label className="text-xs">{localize('com_sidepanel_scheduled_agents_custom_cron')}</Label>
          <Input
            type="text"
            value={state.customCron}
            onChange={(e) => setCustomCron(e.target.value)}
            placeholder="0 9 * * *"
            className="mt-1 font-mono text-sm"
          />
          <p className="mt-0.5 text-xs text-text-secondary">
            {localize('com_sidepanel_scheduled_agents_cron_placeholder')}
          </p>
        </div>
      )}
    </div>
  );
}
