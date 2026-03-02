import { useMemo } from 'react';
import { useLocalize } from '~/hooks';
import { useMCPServerManager } from '~/hooks/MCP/useMCPServerManager';
import { useGetStartupConfig } from '~/data-provider';
import IntegrationServerCard from './IntegrationServerCard';

const DEFAULT_DASHBOARD_INTEGRATIONS = ['Google', 'Microsoft'];

export default function IntegrationsWidget() {
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();

  const {
    availableMCPServers,
    connectionStatus,
    initializeServer,
    cancelOAuthFlow,
    getOAuthUrl,
    isInitializing,
    isCancellable,
    revokeOAuthForServer,
  } = useMCPServerManager({});

  const integrationServers = useMemo(() => {
    const names =
      startupConfig?.interface?.dashboardIntegrations ?? DEFAULT_DASHBOARD_INTEGRATIONS;
    const nameSet = new Set(names);
    return availableMCPServers.filter((s) => nameSet.has(s.serverName));
  }, [availableMCPServers, startupConfig?.interface?.dashboardIntegrations]);

  if (integrationServers.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-border-medium bg-white px-4 py-3 shadow-[0_0_2px_0_rgba(0,0,0,0.05),0_4px_6px_0_rgba(0,0,0,0.02)] transition-colors duration-300 dark:bg-surface-primary">
      <h3 className="mb-1 text-sm font-medium text-text-primary">
        {localize('com_ui_dashboard_integrations_title')}
      </h3>
      <p className="mb-3 text-xs text-text-secondary">
        {localize('com_ui_dashboard_integrations_subtitle')}
      </p>
      <div className="flex flex-col gap-2">
        {integrationServers.map((server) => (
          <IntegrationServerCard
            key={server.serverName}
            server={server}
            serverStatus={connectionStatus?.[server.serverName]}
            isInitializing={isInitializing(server.serverName)}
            getOAuthUrl={getOAuthUrl}
            canCancel={isCancellable(server.serverName)}
            onInitialize={(name) => initializeServer(name, true)}
            onCancel={cancelOAuthFlow}
            revokeOAuthForServer={revokeOAuthForServer}
          />
        ))}
      </div>
    </div>
  );
}
