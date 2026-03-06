import React, { useState, useCallback } from 'react';
import { Send } from 'lucide-react';
import { Button, useToastContext } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useGetAgentsConfig } from '~/hooks/Agents';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';

function TelegramConnect() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { agentsConfig } = useGetAgentsConfig();
  const queryClient = useQueryClient();
  const [isConnecting, setIsConnecting] = useState(false);

  const enabled = agentsConfig?.inboundTelegramEnabled === true;

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: [QueryKeys.telegramStatus],
    queryFn: () => dataService.getTelegramStatus(),
    enabled: !!enabled,
  });

  const connectMutation = useMutation({
    mutationFn: () => dataService.connectTelegram(),
    onSuccess: (data) => {
      if (data?.connectUrl) {
        window.open(data.connectUrl, '_blank', 'noopener,noreferrer');
        showToast({
          message:
            localize('com_ui_telegram_connect_opened') || 'Opened Telegram. Tap Start to connect.',
        });
        queryClient.invalidateQueries({ queryKey: [QueryKeys.telegramStatus] });
      }
    },
    onError: () => {
      showToast({
        message: localize('com_ui_telegram_connect_failed') || 'Failed to generate connect link.',
        status: 'error',
      });
    },
    onSettled: () => setIsConnecting(false),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => dataService.disconnectTelegram(),
    onSuccess: () => {
      showToast({
        message: localize('com_ui_telegram_disconnected') || 'Telegram disconnected.',
      });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.telegramStatus] });
    },
    onError: () => {
      showToast({
        message: localize('com_ui_telegram_disconnect_failed') || 'Failed to disconnect.',
        status: 'error',
      });
    },
  });

  const handleConnect = useCallback(() => {
    if (isConnecting) return;
    setIsConnecting(true);
    connectMutation.mutate();
  }, [isConnecting, connectMutation]);

  const handleDisconnect = useCallback(() => {
    disconnectMutation.mutate();
  }, [disconnectMutation]);

  if (!enabled) {
    return null;
  }

  if (statusLoading) {
    return (
      <div className="pb-3">
        <div className="animate-pulse text-sm text-text-secondary">
          {localize('com_ui_loading') || 'Loading...'}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Send className="icon-sm text-text-secondary" aria-hidden="true" />
          <span className="font-medium text-text-primary">
            {localize('com_ui_telegram') || 'Telegram'}
          </span>
        </div>
        <p className="text-xs text-text-secondary">
          {localize('com_ui_telegram_connect_description') ||
            'Chat with your agent via Telegram. Connect once, then message the bot anytime.'}
        </p>
        {status?.connected ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-green-600 dark:text-green-400">
              {localize('com_ui_telegram_connected') || 'Connected'}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnectMutation.isLoading}
            >
              {localize('com_ui_telegram_disconnect') || 'Disconnect'}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleConnect}
            disabled={isConnecting || connectMutation.isLoading}
          >
            {isConnecting || connectMutation.isLoading
              ? localize('com_ui_loading') || 'Loading...'
              : localize('com_ui_telegram_connect') || 'Connect Telegram'}
          </Button>
        )}
      </div>
    </div>
  );
}

export default React.memo(TelegramConnect);
