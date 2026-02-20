import { useEffect } from 'react';
import { useSetRecoilState } from 'recoil';
import { pendingMCPOAuthAtom } from '~/store/misc';

export const MCP_OAUTH_BROADCAST_CHANNEL = 'librechat_mcp_oauth_complete';
const MCP_OAUTH_COMPLETE_TYPE = 'mcp_oauth_complete';

type MCPOAuthCompleteMessage = {
  type: typeof MCP_OAUTH_COMPLETE_TYPE;
  serverName?: string;
  actionId?: string;
};

function isMCPOAuthCompleteMessage(data: unknown): data is MCPOAuthCompleteMessage {
  return (
    typeof data === 'object' &&
    data != null &&
    'type' in data &&
    (data as MCPOAuthCompleteMessage).type === MCP_OAUTH_COMPLETE_TYPE
  );
}

/**
 * Broadcasts that MCP or Action OAuth completed. Call from OAuthSuccess/OAuthConfirm
 * so the opener can dismiss the overlay (works with noopener).
 */
export function broadcastMCPOAuthComplete(serverName?: string, actionId?: string): void {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(MCP_OAUTH_BROADCAST_CHANNEL);
    channel.postMessage({ type: MCP_OAUTH_COMPLETE_TYPE, serverName, actionId });
    channel.close();
  } catch {
    /* ignore */
  }
}

/**
 * Listens for BroadcastChannel messages from OAuth success/confirm pages.
 * When MCP OAuth completes in a popup (opened with noopener), postMessage cannot
 * reach the opener. BroadcastChannel allows same-origin tabs to communicate,
 * so we clear the overlay when the serverName matches the pending OAuth.
 */
export default function useMCPOAuthBroadcastListener() {
  const setPendingMCPOAuth = useSetRecoilState(pendingMCPOAuthAtom);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') {
      return;
    }
    const channel = new BroadcastChannel(MCP_OAUTH_BROADCAST_CHANNEL);
    const handler = (event: MessageEvent<unknown>) => {
      try {
        const data = event.data;
        if (!isMCPOAuthCompleteMessage(data)) {
          return;
        }
        setPendingMCPOAuth((prev) => {
          if (!prev) return null;
          if (data.serverName && prev.serverName === data.serverName) return null;
          if (data.actionId && prev.actionId === data.actionId) return null;
          return prev;
        });
      } catch {
        /* ignore */
      }
    };
    channel.addEventListener('message', handler);
    return () => {
      channel.removeEventListener('message', handler);
      channel.close();
    };
  }, [setPendingMCPOAuth]);
}
