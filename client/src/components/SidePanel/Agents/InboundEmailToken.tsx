import { memo } from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import {
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
  CircleHelpIcon,
} from '@librechat/client';
import type { AgentForm } from '~/common';
import { useLocalize } from '~/hooks';
import { ESide } from '~/common';
import { cn, defaultTextProps, removeFocusOutlines } from '~/utils';

const inputClass = cn(
  defaultTextProps,
  'flex w-full px-3 py-2 border-border-light bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring-primary',
  removeFocusOutlines,
);

function InboundEmailToken() {
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { control } = methods;

  return (
    <HoverCard openDelay={50}>
      <div className="my-2 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <label
            htmlFor="inbound-email-token"
            className="form-check-label text-token-text-primary block font-medium"
          >
            {localize('com_agents_inbound_email_token')}
          </label>
          <HoverCardTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center"
              aria-label={localize('com_agents_receive_email_info')}
            >
              <CircleHelpIcon className="h-4 w-4 text-text-tertiary" />
            </button>
          </HoverCardTrigger>
        </div>
        <Controller
          name="inboundEmailToken"
          control={control}
          render={({ field }) => (
            <input
              {...field}
              id="inbound-email-token"
              type="text"
              value={field.value ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v.includes('__')) {
                  return;
                }
                field.onChange(v || '');
              }}
              placeholder={localize('com_agents_inbound_email_token_placeholder')}
              className={inputClass}
              aria-label={localize('com_agents_inbound_email_token')}
              maxLength={64}
            />
          )}
        />
        <HoverCardPortal>
          <HoverCardContent side={ESide.Top} className="w-80">
            <div className="space-y-2">
              <p className="text-sm text-text-secondary">
                {localize('com_agents_receive_email_info')}
              </p>
            </div>
          </HoverCardContent>
        </HoverCardPortal>
      </div>
    </HoverCard>
  );
}

export default memo(InboundEmailToken);
