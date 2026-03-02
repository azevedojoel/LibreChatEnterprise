import { RefreshCw, Trash2 } from 'lucide-react';
import { Button, Spinner } from '@librechat/client';
import { MCPIcon } from '@librechat/client';
import { useLocalize } from '~/hooks';
import OAuthLink from '~/components/OAuth/OAuthLink';
import { getStatusColor, getStatusTextKey } from '~/components/MCP/mcpServerUtils';
import type { MCPServerDefinition } from '~/hooks/MCP/useMCPServerManager';
import type { MCPServerStatus } from 'librechat-data-provider';
import { cn } from '~/utils';

interface IntegrationServerCardProps {
  server: MCPServerDefinition;
  serverStatus?: MCPServerStatus;
  isInitializing: boolean;
  getOAuthUrl: (serverName: string) => string | null | undefined;
  canCancel: boolean;
  onInitialize: (serverName: string) => void;
  onCancel: (serverName: string) => void;
  revokeOAuthForServer?: (serverName: string) => void;
}

export default function IntegrationServerCard({
  server,
  serverStatus,
  isInitializing,
  getOAuthUrl,
  canCancel,
  onInitialize,
  onCancel,
  revokeOAuthForServer,
}: IntegrationServerCardProps) {
  const localize = useLocalize();
  const displayName = server.config?.title || server.serverName;
  const requiresOAuth = serverStatus?.requiresOAuth ?? true;
  const isConnected = serverStatus?.connectionState === 'connected';
  const serverOAuthUrl = getOAuthUrl(server.serverName);
  const statusColor = getStatusColor(server.serverName, { [server.serverName]: serverStatus }, () => isInitializing);
  const statusTextKey = getStatusTextKey(server.serverName, { [server.serverName]: serverStatus }, () => isInitializing);
  const statusText =
    statusTextKey === 'com_nav_mcp_status_connecting'
      ? localize(statusTextKey as Parameters<typeof localize>[0], { 0: displayName })
      : localize(statusTextKey as Parameters<typeof localize>[0]);

  const shouldShowReinit = isConnected && requiresOAuth;
  const shouldShowInit = !isConnected && !serverOAuthUrl;

  if (!shouldShowReinit && !shouldShowInit && !serverOAuthUrl) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border-medium bg-surface-secondary/50 px-3 py-2">
      {/* Icon */}
      <div className="relative flex-shrink-0">
        {server.config?.iconPath ? (
          <img
            src={server.config.iconPath}
            className="h-9 w-9 rounded-lg object-cover"
            alt={displayName}
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-tertiary">
            <MCPIcon className="h-5 w-5 text-text-secondary" />
          </div>
        )}
        <div
          aria-hidden="true"
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface-secondary',
            statusColor,
          )}
        />
      </div>

      {/* Name and status */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{displayName}</p>
        <p className="truncate text-xs text-text-secondary">{statusText}</p>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        {serverOAuthUrl ? (
          <>
            <Button
              onClick={() => onCancel(server.serverName)}
              disabled={!canCancel}
              variant="outline"
              size="sm"
            >
              {localize('com_ui_cancel')}
            </Button>
            <OAuthLink href={serverOAuthUrl} variant="submit" size="sm">
              {localize('com_ui_continue_oauth')}
            </OAuthLink>
          </>
        ) : (
          <>
            {requiresOAuth && isConnected && revokeOAuthForServer && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => revokeOAuthForServer(server.serverName)}
                aria-label={localize('com_ui_revoke')}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant={shouldShowReinit ? 'outline' : 'default'}
              onClick={() => onInitialize(server.serverName)}
              disabled={isInitializing}
              size="sm"
            >
              {isInitializing ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              {isInitializing
                ? localize('com_ui_loading')
                : shouldShowReinit
                  ? localize('com_ui_dashboard_integrations_reconnect')
                  : localize('com_ui_dashboard_integrations_link')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
