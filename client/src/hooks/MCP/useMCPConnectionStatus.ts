import { useMCPConnectionStatusQuery } from '~/data-provider/Tools/queries';

export function useMCPConnectionStatus({ enabled }: { enabled?: boolean } = {}) {
  const { data } = useMCPConnectionStatusQuery({
    enabled,
    refetchInterval: (queryData) => {
      const status = queryData?.connectionStatus;
      const hasConnecting =
        status &&
        Object.values(status).some((s) => s?.connectionState === 'connecting');
      return hasConnecting ? 5000 : false;
    },
  });

  return {
    connectionStatus: data?.connectionStatus,
  };
}
