import { useCallback, useMemo } from 'react';
import { Button } from '@librechat/client';
import { TriangleAlert } from 'lucide-react';
import { Constants, dataService } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { logger } from '~/utils';

type AuthCTAProps = {
  auth: string;
  name: string;
  onCancel?: () => void;
};

export default function AuthCTA({ auth, name, onCancel }: AuthCTAProps) {
  const localize = useLocalize();

  const { isMCPToolCall, mcpServerName, authDomain, actionId } = useMemo(() => {
    if (typeof name !== 'string' || !auth) {
      return { isMCPToolCall: false, mcpServerName: '', authDomain: '', actionId: '' };
    }
    const isMCP = name.includes(Constants.mcp_delimiter);
    let server = '';
    if (isMCP) {
      const parts = name.split(Constants.mcp_delimiter);
      server = parts.pop() || '';
    }
    let domain = '';
    try {
      const url = new URL(auth);
      domain = url.hostname;
    } catch (e) {
      logger.error('AuthCTA: Failed to parse auth URL', e);
    }
    let action = '';
    if (!isMCP && auth) {
      try {
        const url = new URL(auth);
        const redirectUri = url.searchParams.get('redirect_uri') || '';
        const match = redirectUri.match(/\/api\/actions\/([^/]+)\/oauth\/callback/);
        action = match?.[1] || '';
      } catch {
        /* ignore */
      }
    }
    return {
      isMCPToolCall: isMCP,
      mcpServerName: server,
      authDomain: domain,
      actionId: action,
    };
  }, [auth, name]);

  const handleOAuthClick = useCallback(async () => {
    if (!auth) return;
    try {
      if (isMCPToolCall && mcpServerName) {
        await dataService.bindMCPOAuth(mcpServerName);
      } else if (actionId) {
        await dataService.bindActionOAuth(actionId);
      }
    } catch (e) {
      logger.error('Failed to bind OAuth CSRF cookie', e);
    }
    window.open(auth, '_blank', 'noopener,noreferrer');
  }, [auth, isMCPToolCall, mcpServerName, actionId]);

  const handleCancelClick = useCallback(async () => {
    if (isMCPToolCall && mcpServerName) {
      try {
        await dataService.cancelMCPOAuth(mcpServerName);
        onCancel?.();
      } catch (e) {
        logger.error('Failed to cancel MCP OAuth', e);
      }
    }
  }, [isMCPToolCall, mcpServerName, onCancel]);

  if (!auth || !authDomain) return null;

  const canCancel = isMCPToolCall && mcpServerName;

  return (
    <div className="flex w-full flex-col gap-2.5">
      <div className="mb-1 mt-2 flex flex-wrap items-center gap-2">
        <Button
          className="font-medium inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm"
          variant="default"
          rel="noopener noreferrer"
          onClick={handleOAuthClick}
        >
          {localize('com_ui_sign_in_to_domain', { 0: authDomain })}
        </Button>
        {canCancel && (
          <Button
            variant="outline"
            className="font-medium inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm"
            onClick={handleCancelClick}
          >
            {localize('com_ui_cancel')}
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
