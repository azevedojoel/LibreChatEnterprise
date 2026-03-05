import React, { useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { FileText, GitFork } from 'lucide-react';
import { useToastContext } from '@librechat/client';
import { Constants } from 'librechat-data-provider';
import { useLocalize, useNavigateToConvo } from '~/hooks';
import { useSummarizeThreadMutation } from '~/data-provider';
import { cn } from '~/utils';

export default function SummarizeButton({
  messageId,
  conversationId: _convoId,
  parentMessageId,
  isLast = false,
  isSubmitting = false,
}: {
  messageId: string;
  conversationId: string | null;
  parentMessageId?: string | null;
  isLast?: boolean;
  isSubmitting?: boolean;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { navigateToConvo } = useNavigateToConvo();
  const [isActive, setIsActive] = useState(false);
  const popoverStore = Ariakit.usePopoverStore({
    placement: 'bottom',
  });

  const conversationId = _convoId ?? '';
  const hasMessagesBefore =
    parentMessageId != null && parentMessageId !== '' && parentMessageId !== Constants.NO_PARENT;

  const summarizeThread = useSummarizeThreadMutation({
    onSuccess: (data, vars) => {
      if (vars.mode === 'inPlace') {
        showToast({
          message: localize('com_ui_summarize_success'),
          status: 'success',
        });
      } else {
        navigateToConvo(data.conversation);
        showToast({
          message: localize('com_ui_summarize_fork_success'),
          status: 'success',
        });
      }
    },
    onMutate: (vars) => {
      showToast({
        message:
          vars.mode === 'inPlace'
            ? localize('com_ui_summarize_processing')
            : localize('com_ui_summarize_fork_processing'),
        status: 'info',
      });
    },
    onError: (error: unknown) => {
      const err = error as {
        message?: string;
        response?: { data?: { error?: string }; status?: number };
      };
      const message =
        err?.response?.data?.error ?? err?.message ?? localize('com_ui_summarize_error');
      showToast({
        message,
        status: 'error',
      });
    },
  });

  const buttonStyle = cn(
    'hover-button rounded-lg p-1.5 text-text-secondary-alt',
    'hover:text-text-primary hover:bg-surface-hover',
    'md:group-hover:visible md:group-focus-within:visible md:group-[.final-completion]:visible',
    !isLast && 'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100',
    'focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white focus-visible:outline-none',
    isActive && 'active text-text-primary bg-surface-hover',
  );

  if (!hasMessagesBefore || !conversationId || !messageId || isSubmitting) {
    return null;
  }

  const handleSummarize = (mode: 'inPlace' | 'fork') => {
    popoverStore.hide();
    summarizeThread.mutate({
      conversationId,
      messageId,
      mode,
    });
  };

  return (
    <>
      <Ariakit.PopoverAnchor
        store={popoverStore}
        render={
          <button
            className={buttonStyle}
            onClick={() => {
              popoverStore.toggle();
              setIsActive(popoverStore.getState().open);
            }}
            type="button"
            aria-label={localize('com_ui_summarize')}
            title={localize('com_ui_summarize')}
          >
            <FileText size={19} aria-hidden="true" />
          </button>
        }
      />
      <Ariakit.Popover
        store={popoverStore}
        gutter={10}
        className={cn(
          'popover-animate flex w-56 flex-col gap-2 overflow-hidden rounded-2xl border border-border-medium',
          'bg-surface-secondary p-2 shadow-lg',
          isActive && 'open',
        )}
        style={{
          outline: 'none',
          pointerEvents: 'auto',
          zIndex: 50,
        }}
        portal={true}
        unmountOnHide={true}
        onClose={() => setIsActive(false)}
      >
        <div className="px-2 py-1 text-sm font-medium text-text-primary">
          {localize('com_ui_summarize_from_message')}
        </div>
        <button
          type="button"
          onClick={() => handleSummarize('inPlace')}
          disabled={summarizeThread.isPending}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-surface-hover disabled:opacity-50"
        >
          <FileText className="size-4 shrink-0" aria-hidden="true" />
          <span>{localize('com_ui_summarize_here')}</span>
        </button>
        <button
          type="button"
          onClick={() => handleSummarize('fork')}
          disabled={summarizeThread.isPending}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-surface-hover disabled:opacity-50"
        >
          <GitFork className="size-4 shrink-0" aria-hidden="true" />
          <span>{localize('com_ui_summarize_to_new')}</span>
        </button>
      </Ariakit.Popover>
    </>
  );
}
