import { memo } from 'react';
import { AgentCapabilities } from 'librechat-data-provider';
import { useFormContext, Controller } from 'react-hook-form';
import {
  Checkbox,
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
  CircleHelpIcon,
} from '@librechat/client';
import type { AgentForm } from '~/common';
import { useLocalize } from '~/hooks';
import { ESide } from '~/common';

function RunSubAgentCheckbox() {
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { control } = methods;

  return (
    <>
      <HoverCard openDelay={50}>
        <div className="my-2 flex items-center">
          <Controller
            name={AgentCapabilities.run_sub_agent}
            control={control}
            render={({ field }) => (
              <Checkbox
                {...field}
                id="run-sub-agent-checkbox"
                checked={field.value ?? false}
                onCheckedChange={field.onChange}
                className="relative float-left mr-2 inline-flex h-4 w-4 cursor-pointer"
                value={(field.value ?? false).toString()}
                aria-labelledby="run-sub-agent-label"
              />
            )}
          />
          <label
            id="run-sub-agent-label"
            htmlFor="run-sub-agent-checkbox"
            className="form-check-label text-token-text-primary cursor-pointer"
          >
            {localize('com_agents_enable_run_sub_agent')}
          </label>
          <HoverCardTrigger asChild className="ml-2">
            <button
              type="button"
              className="inline-flex items-center"
              aria-label={localize('com_agents_run_sub_agent_info')}
            >
              <CircleHelpIcon className="h-4 w-4 text-text-tertiary" />
            </button>
          </HoverCardTrigger>
          <HoverCardPortal>
            <HoverCardContent side={ESide.Top} className="w-80">
              <div className="space-y-2">
                <p className="text-sm text-text-secondary">
                  {localize('com_agents_run_sub_agent_info')}
                </p>
              </div>
            </HoverCardContent>
          </HoverCardPortal>
        </div>
      </HoverCard>
    </>
  );
}

export default memo(RunSubAgentCheckbox);
