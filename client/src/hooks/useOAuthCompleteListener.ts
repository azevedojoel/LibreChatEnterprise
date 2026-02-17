import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';

const OAUTH_COMPLETE_TYPE = 'oauth_complete';

type OAuthCompleteMessage = {
  type: typeof OAUTH_COMPLETE_TYPE;
  serverName?: string;
};

function isOAuthCompleteMessage(data: unknown): data is OAuthCompleteMessage {
  return (
    typeof data === 'object' &&
    data != null &&
    'type' in data &&
    (data as OAuthCompleteMessage).type === OAUTH_COMPLETE_TYPE
  );
}

/**
 * Listens for postMessage from OAuth success popup.
 * When OAuth completes and the opener receives it, invalidate messages to pick up
 * any continuation that may have been missed if the stream dropped during OAuth.
 */
export default function useOAuthCompleteListener(conversationId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!isOAuthCompleteMessage(data) || !conversationId) {
          return;
        }
        queryClient.invalidateQueries({ queryKey: [QueryKeys.messages, conversationId] });
      } catch {
        /* ignore parse errors */
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [queryClient, conversationId]);
}

export { OAUTH_COMPLETE_TYPE };
