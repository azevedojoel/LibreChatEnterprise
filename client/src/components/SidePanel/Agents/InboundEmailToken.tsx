import { memo, useState, useCallback } from 'react';
import { useFormContext, Controller, useWatch } from 'react-hook-form';
import { Copy, CopyCheck } from 'lucide-react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
  CircleHelpIcon,
  Button,
  useToastContext,
} from '@librechat/client';
import type { AgentForm } from '~/common';
import { useLocalize } from '~/hooks';
import { useAgentPanelContext } from '~/Providers';
import { ESide } from '~/common';
import { cn, defaultTextProps, removeFocusOutlines } from '~/utils';

const inputClass = cn(
  defaultTextProps,
  'flex w-full px-3 py-2 pr-12 border-border-light bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring-primary',
  removeFocusOutlines,
);

function InboundEmailToken() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const methods = useFormContext<AgentForm>();
  const { control } = methods;
  const { agentsConfig } = useAgentPanelContext();
  const inboundEmailToken = useWatch({ control, name: 'inboundEmailToken' }) ?? '';
  const inboundEmailAddress = agentsConfig?.inboundEmailAddress;
  const [isCopying, setIsCopying] = useState(false);

  const fullEmail =
    inboundEmailAddress && inboundEmailToken.trim()
      ? `inbound+${inboundEmailToken.trim()}@${inboundEmailAddress}`
      : '';

  const canCopy = Boolean(fullEmail);
  const handleCopy = useCallback(async () => {
    if (!canCopy || isCopying) return;
    setIsCopying(true);
    try {
      await navigator.clipboard.writeText(fullEmail);
      showToast({ message: localize('com_ui_copied_to_clipboard') });
    } catch {
      showToast({ message: localize('com_agents_link_copy_failed'), status: 'error' });
    } finally {
      setTimeout(() => setIsCopying(false), 3000);
    }
  }, [canCopy, fullEmail, isCopying, showToast, localize]);

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
        <div className="relative flex items-center">
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
          <div className="absolute right-0 flex h-full items-center pr-1">
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={handleCopy}
              disabled={!canCopy}
              className={cn('h-8 rounded-md px-2', isCopying ? 'cursor-default' : '')}
              aria-label={localize('com_ui_copy_link')}
            >
              {isCopying ? (
                <CopyCheck className="size-4" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
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
