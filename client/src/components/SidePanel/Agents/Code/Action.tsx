import { AgentCapabilities } from 'librechat-data-provider';
import { useFormContext, Controller } from 'react-hook-form';
import {
  Checkbox,
  HoverCard,
  CircleHelpIcon,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
} from '@librechat/client';
import type { AgentForm } from '~/common';
import { useLocalize } from '~/hooks';
import { ESide } from '~/common';
import { cn } from '~/utils';

/** Code runs locally - no API key needed */
export default function Action() {
  const localize = useLocalize();
  const { control, setValue } = useFormContext<AgentForm>();
  const handleCheckboxChange = (checked: boolean) => {
    setValue(AgentCapabilities.execute_code, checked, { shouldDirty: true });
  };

  return (
    <HoverCard openDelay={50}>
      <div className="flex items-center">
        <Controller
          name={AgentCapabilities.execute_code}
          control={control}
          render={({ field }) => (
            <Checkbox
              {...field}
              id="execute-code-checkbox"
              checked={!!field.value}
              onCheckedChange={handleCheckboxChange}
              className="relative float-left mr-2 inline-flex h-4 w-4 cursor-pointer"
              value={field.value.toString()}
              aria-labelledby="execute-code-label"
            />
          )}
        />
        <label
          id="execute-code-label"
          htmlFor="execute-code-checkbox"
          className="form-check-label text-token-text-primary cursor-pointer"
        >
          {localize('com_ui_run_code')}
        </label>
        <HoverCardTrigger asChild>
          <button
            type="button"
            className="ml-2 inline-flex items-center"
            aria-label={localize('com_agents_code_interpreter')}
          >
            <CircleHelpIcon className="h-4 w-4 text-text-tertiary" />
          </button>
        </HoverCardTrigger>
      </div>
      <HoverCardPortal>
        <HoverCardContent side={ESide.Top} className="w-80">
          <div className="space-y-2">
            <p className="text-sm text-text-secondary">
              {localize('com_agents_code_interpreter')}
            </p>
          </div>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
}
