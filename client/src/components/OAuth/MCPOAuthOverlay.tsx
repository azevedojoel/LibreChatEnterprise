import { useCallback, useEffect, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { Button } from '@librechat/client';
import { TriangleAlert } from 'lucide-react';
import { dataService } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { logger } from '~/utils';
import { pendingMCPOAuthAtom, type PendingMCPOAuth } from '~/store/misc';
import OAuthLink from './OAuthLink';

function OverlayContent({ pending }: { pending: PendingMCPOAuth }) {
  const localize = useLocalize();
  const setPendingMCPOAuth = useSetRecoilState(pendingMCPOAuthAtom);
  const [bindReady, setBindReady] = useState(false);

  const authDomain = (() => {
    try {
      return new URL(pending.authUrl).hostname;
    } catch {
      return '';
    }
  })();

  // Fire bind when overlay appears so CSRF cookie is ready before user clicks the link
  useEffect(() => {
    if (!pending.authUrl) return;
    setBindReady(false);
    const bind = pending.actionId
      ? dataService.bindActionOAuth(pending.actionId)
      : pending.serverName
        ? dataService.bindMCPOAuth(pending.serverName)
        : Promise.resolve();
    bind
      .then(() => setBindReady(true))
      .catch((e) => {
        logger.error('Failed to bind OAuth CSRF cookie', e);
        setBindReady(true); // Allow click anyway; callback may fail
      });
  }, [pending.authUrl, pending.serverName, pending.actionId]);

  const handleCancel = useCallback(async () => {
    if (pending.serverName) {
      try {
        await dataService.cancelMCPOAuth(pending.serverName);
      } catch (e) {
        logger.error('Failed to cancel MCP OAuth', e);
      }
    }
    setPendingMCPOAuth(null);
  }, [pending.serverName, setPendingMCPOAuth]);

  if (!authDomain) {
    return (
      <div className="mx-auto flex w-[calc(100%-2rem)] max-w-md flex-col gap-4 rounded-xl border border-border-medium bg-surface-primary p-6 shadow-xl">
        <h2 id="mcp-oauth-overlay-title" className="text-lg font-semibold text-text-primary">
          {localize('com_ui_sign_in_required') || 'Connect your account'}
        </h2>
        <p className="text-sm text-text-secondary">
          {localize('com_ui_invalid_link') || 'Invalid authentication link. Please try again.'}
        </p>
        <Button
          variant="ghost"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary"
          onClick={() => setPendingMCPOAuth(null)}
        >
          {localize('com_ui_close') || 'Close'}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-[calc(100%-2rem)] max-w-md flex-col gap-4 rounded-xl border border-border-medium bg-surface-primary p-6 shadow-xl">
      <h2 id="mcp-oauth-overlay-title" className="text-lg font-semibold text-text-primary">
        {localize('com_ui_sign_in_required') || 'Connect your account'}
      </h2>
      <p className="text-sm text-text-secondary">
        {localize('com_assistants_mcp_oauth_prompt', {
          0: pending.serverName || pending.actionId || authDomain,
        }) ||
          `To continue with ${pending.serverName || pending.actionId || authDomain} please sign in.`}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <OAuthLink
          href={pending.authUrl}
          disabled={!bindReady}
          variant="default"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl px-4 py-2 text-sm font-medium sm:shrink-0"
        >
          {localize('com_ui_sign_in_to_domain', {
            0: pending.serverName || pending.actionId || authDomain,
          })}
        </OAuthLink>
        {pending.serverName && (
          <Button
            variant="outline"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl px-4 py-2 text-sm font-medium sm:shrink-0"
            onClick={handleCancel}
          >
            {localize('com_ui_cancel')}
          </Button>
        )}
        {/* Hide Close for MCP - modal blocks until Sign In or Cancel. Actions need Close (no cancel API). */}
        {!pending.serverName && (
          <Button
            variant="ghost"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary sm:shrink-0"
            onClick={() => setPendingMCPOAuth(null)}
          >
            {localize('com_ui_close') || 'Close'}
          </Button>
        )}
      </div>
      <p className="flex items-center text-xs text-text-warning">
        <TriangleAlert className="mr-1.5 inline-block h-4 w-4 shrink-0" aria-hidden="true" />
        {localize('com_assistants_allow_sites_you_trust')}
      </p>
    </div>
  );
}

export default function MCPOAuthOverlay() {
  const pending = useRecoilValue(pendingMCPOAuthAtom);

  if (!pending) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mcp-oauth-overlay-title"
    >
      <OverlayContent pending={pending} />
    </div>
  );
}
