import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, useToastContext } from '@librechat/client';
import { useAuthContext, useLocalize } from '~/hooks';
import { useGetAgentsConfig } from '~/hooks/Agents';
import { useConversationsInfiniteQuery } from '~/data-provider';

export default function EmailEllisWidget() {
  const { user } = useAuthContext();
  const { agentsConfig } = useGetAgentsConfig();
  const { showToast } = useToastContext();
  const localize = useLocalize();
  const [isCopying, setIsCopying] = useState(false);

  const displayDomain =
    agentsConfig?.inboundEmailDisplayDomain ?? agentsConfig?.inboundEmailAddress;
  const inboundEmailToken = user?.inboundEmailToken?.trim() ?? '';
  const fullEmail =
    displayDomain && inboundEmailToken ? `${inboundEmailToken}@${displayDomain}` : '';

  const { data: emailConvosData } = useConversationsInfiniteQuery(
    {
      tags: ['inbound_email'],
      limit: 4,
      sortBy: 'updatedAt',
      sortDirection: 'desc',
    },
    {
      enabled: !!agentsConfig?.inboundEmailAddress,
    },
  );

  const emailConversations = useMemo(() => {
    const pages = emailConvosData?.pages ?? [];
    return pages.flatMap((p) => p.conversations ?? []).slice(0, 4);
  }, [emailConvosData]);

  const handleCopy = useCallback(async () => {
    if (!fullEmail || isCopying) return;
    setIsCopying(true);
    try {
      await navigator.clipboard.writeText(fullEmail);
      showToast({ message: localize('com_ui_copied_to_clipboard') });
    } catch {
      showToast({ message: localize('com_agents_link_copy_failed'), status: 'error' });
    } finally {
      setTimeout(() => setIsCopying(false), 3000);
    }
  }, [fullEmail, isCopying, showToast, localize]);

  if (!agentsConfig?.inboundEmailAddress) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-border-medium bg-white px-4 py-3 shadow-[0_0_2px_0_rgba(0,0,0,0.05),0_4px_6px_0_rgba(0,0,0,0.02)] transition-colors duration-300 dark:bg-surface-primary">
      <h3 className="mb-1 text-sm font-medium text-text-primary">
        {localize('com_ui_dashboard_email_ellis_title')}
      </h3>
      <p className="mb-2 text-xs text-text-secondary">
        {localize('com_ui_dashboard_email_ellis_subtitle')}
      </p>
      {fullEmail ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-surface-secondary px-2 py-1 text-sm text-text-primary">
              {fullEmail}
            </code>
            <Button
              onClick={handleCopy}
              disabled={isCopying}
              className="shrink-0"
              variant="outline"
              size="sm"
            >
              {isCopying ? localize('com_ui_copied_to_clipboard') : localize('com_ui_copy')}
            </Button>
          </div>
          {emailConversations.length > 0 && (
            <div className="mt-2 border-t border-border-medium pt-2">
              <p className="mb-1.5 text-xs font-medium text-text-secondary">
                {localize('com_ui_dashboard_email_ellis_recent')}
              </p>
              <ul className="flex flex-col gap-1">
                {emailConversations.map((convo) => (
                  <li key={convo.conversationId}>
                    <Link
                      to={`/c/${convo.conversationId}`}
                      className="decoration-text-secondary/50 hover:text-accent-primary hover:decoration-accent-primary block truncate text-sm text-text-primary underline underline-offset-2"
                    >
                      {convo.title || localize('com_ui_dashboard_email_ellis_convo_fallback')}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-text-secondary">
          {localize('com_ui_dashboard_email_ellis_configure')}
        </p>
      )}
    </div>
  );
}
