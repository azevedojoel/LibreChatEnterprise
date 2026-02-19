import { useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { Button } from '@librechat/client';
import { dataService } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { logger } from '~/utils';
import { pendingToolOAuthAtom } from '~/store/toolOAuth';

export default function ToolOAuthOverlay() {
  const localize = useLocalize();
  const pendingOAuth = useAtomValue(pendingToolOAuthAtom);
  const setPendingOAuth = useSetAtom(pendingToolOAuthAtom);

  const handleLogIn = useCallback(async () => {
    if (!pendingOAuth?.auth) return;
    try {
      if (pendingOAuth.isMCP && pendingOAuth.serverName) {
        await dataService.bindMCPOAuth(pendingOAuth.serverName);
      } else if (pendingOAuth.actionId) {
        await dataService.bindActionOAuth(pendingOAuth.actionId);
      }
      window.open(pendingOAuth.auth, '_blank', 'noopener,noreferrer');
    } catch (e) {
      logger.error('ToolOAuthOverlay: Failed to bind OAuth CSRF cookie', e);
    }
  }, [pendingOAuth]);

  const handleCancel = useCallback(async () => {
    if (!pendingOAuth) return;
    setPendingOAuth(null);
    if (pendingOAuth.isMCP && pendingOAuth.serverName) {
      try {
        await dataService.cancelMCPOAuth(pendingOAuth.serverName);
      } catch (e) {
        logger.error('ToolOAuthOverlay: Failed to cancel MCP OAuth', e);
      }
    }
  }, [pendingOAuth, setPendingOAuth]);

  if (!pendingOAuth || !pendingOAuth.authDomain) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[9998] bg-black/60 transition-opacity duration-200"
        style={{ willChange: 'opacity' }}
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tool-oauth-title"
      >
        <div className="bg-surface-primary flex w-full max-w-md flex-col gap-6 rounded-2xl p-8 shadow-xl">
          <h2
            id="tool-oauth-title"
            className="text-center text-xl font-semibold text-text-primary"
          >
            {localize('com_ui_sign_in_to_domain', { 0: pendingOAuth.authDomain })}
          </h2>
          <p className="text-center text-sm text-text-secondary">
            {localize('com_assistants_allow_sites_you_trust')}
          </p>
          <div className="flex flex-col gap-3">
            <Button
              variant="default"
              className="w-full font-medium"
              onClick={handleLogIn}
            >
              {localize('com_ui_continue_oauth')}
            </Button>
            {pendingOAuth.isMCP && (
              <Button
                variant="outline"
                className="w-full font-medium"
                onClick={handleCancel}
              >
                {localize('com_ui_cancel')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
