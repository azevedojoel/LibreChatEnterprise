import { useCallback } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { Button } from '@librechat/client';
import { TriangleAlert } from 'lucide-react';
import { dataService } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { logger } from '~/utils';
import { pendingMCPOAuthAtom, type PendingMCPOAuth } from '~/store/misc';

function OverlayContent({ pending }: { pending: PendingMCPOAuth }) {
  const localize = useLocalize();
  const setPendingMCPOAuth = useSetRecoilState(pendingMCPOAuthAtom);

  const authDomain = (() => {
    try {
      return new URL(pending.authUrl).hostname;
    } catch {
      return '';
    }
  })();

  const handleSignIn = useCallback(async () => {
    if (!pending.authUrl) return;
    try {
      if (pending.actionId) {
        await dataService.bindActionOAuth(pending.actionId);
      } else if (pending.serverName) {
        await dataService.bindMCPOAuth(pending.serverName);
      }
    } catch (e) {
      logger.error('Failed to bind OAuth CSRF cookie', e);
    }
    window.open(pending.authUrl, '_blank', 'noopener,noreferrer');
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
        <Button
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl px-4 py-2 text-sm font-medium sm:shrink-0"
          variant="default"
          rel="noopener noreferrer"
          onClick={handleSignIn}
        >
          {localize('com_ui_sign_in_to_domain', {
            0: pending.serverName || pending.actionId || authDomain,
          })}
        </Button>
        {pending.serverName && (
          <Button
            variant="outline"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl px-4 py-2 text-sm font-medium sm:shrink-0"
            onClick={handleCancel}
          >
            {localize('com_ui_cancel')}
          </Button>
        )}
        <Button
          variant="ghost"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary sm:shrink-0"
          onClick={() => setPendingMCPOAuth(null)}
        >
          {localize('com_ui_close') || 'Close'}
        </Button>
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
