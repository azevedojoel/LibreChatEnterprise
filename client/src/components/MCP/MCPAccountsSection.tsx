import React from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@librechat/client';
import { useLocalize } from '~/hooks';
import {
  useMCPAccountsQuery,
  useSetMCPActiveAccountMutation,
  useReinitializeMCPServerMutation,
} from 'librechat-data-provider/react-query';
import { useToastContext } from '@librechat/client';
import { openOAuthUrl } from '~/utils';

const MULTI_ACCOUNT_SERVERS = new Set(['Google', 'Microsoft']);

interface MCPAccountsSectionProps {
  serverName: string;
  isConnected: boolean;
  onAddAccountStart?: () => void;
  onAddAccountComplete?: () => void;
}

export default function MCPAccountsSection({
  serverName,
  isConnected,
  onAddAccountStart,
  onAddAccountComplete,
}: MCPAccountsSectionProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const isMultiAccount = MULTI_ACCOUNT_SERVERS.has(serverName);

  const { data: accountsData, isLoading } = useMCPAccountsQuery(serverName, {
    enabled: isMultiAccount && isConnected,
  });

  const setActiveMutation = useSetMCPActiveAccountMutation();
  const reinitializeMutation = useReinitializeMCPServerMutation();

  const handleAddAccount = async () => {
    onAddAccountStart?.();
    try {
      const response = await reinitializeMutation.mutateAsync({
        serverName,
        addAccount: true,
      });
      if (response.oauthRequired && response.oauthUrl) {
        openOAuthUrl(response.oauthUrl);
      }
      onAddAccountComplete?.();
    } catch {
      showToast({
        message: localize('com_ui_mcp_init_failed'),
        status: 'error',
      });
    }
  };

  const handleSetActive = async (accountId: string) => {
    try {
      await setActiveMutation.mutateAsync({ serverName, accountId });
      showToast({
        message: localize('com_ui_mcp_active') + `: ${accountId}`,
        status: 'success',
      });
    } catch {
      showToast({
        message: localize('com_ui_mcp_init_failed'),
        status: 'error',
      });
    }
  };

  if (!isMultiAccount || !isConnected) {
    return null;
  }

  const accounts = accountsData?.accounts ?? [];
  const activeAccountId = accountsData?.activeAccountId ?? null;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-text-secondary">
          {localize('com_ui_mcp_connected_accounts')}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleAddAccount}
          disabled={reinitializeMutation.isLoading}
          className="h-7 gap-1 px-2 text-xs"
        >
          <UserPlus className="h-3.5 w-3.5" />
          {localize('com_ui_mcp_add_account')}
        </Button>
      </div>
      {isLoading ? (
        <div className="text-xs text-text-tertiary">...</div>
      ) : accounts.length > 0 ? (
        <ul className="space-y-1">
          {accounts.map(({ accountId }) => (
            <li
              key={accountId}
              className="flex items-center justify-between gap-2 rounded-md bg-surface-secondary px-2 py-1.5 text-sm"
            >
              <span className="truncate text-text-primary">{accountId}</span>
              {activeAccountId === accountId ? (
                <span className="shrink-0 text-xs text-text-tertiary">
                  ({localize('com_ui_mcp_active')})
                </span>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSetActive(accountId)}
                  disabled={setActiveMutation.isLoading}
                  className="h-6 px-2 text-xs"
                >
                  {localize('com_ui_mcp_set_active')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
