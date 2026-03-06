import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SystemRoles, PermissionBits } from 'librechat-data-provider';
import { Button, Spinner } from '@librechat/client';
import { Bot, Plus } from 'lucide-react';
import { useListAgentsQuery } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { AgentPanelProvider, useAgentPanelContext } from '~/Providers/AgentPanelContext';
import DashBreadcrumb from '~/routes/Layouts/DashBreadcrumb';
import AgentPanel from '~/components/SidePanel/Agents/AgentPanel';
import { cn } from '~/utils';

function AgentsViewContent() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const localize = useLocalize();
  const { setCurrentAgentId, agent_id: contextAgentId } = useAgentPanelContext();

  const { data: agentsResponse, isLoading } = useListAgentsQuery(
    { requiredPermission: PermissionBits.EDIT, limit: 100 },
    { enabled: !!user && user.role === SystemRoles.ADMIN },
  );

  const agents = agentsResponse?.data ?? [];
  const [selectedAgentId, setSelectedAgentId] = React.useState<string | undefined>(undefined);
  const [isCreateMode, setIsCreateMode] = React.useState(false);

  useEffect(() => {
    if (user && user.role !== SystemRoles.ADMIN) {
      navigate('/c/new', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    setCurrentAgentId(selectedAgentId);
  }, [selectedAgentId, setCurrentAgentId]);

  // Sync from context when agent is created (create mutation sets context directly)
  useEffect(() => {
    if (contextAgentId && contextAgentId !== selectedAgentId) {
      setSelectedAgentId(contextAgentId);
      setIsCreateMode(false);
    }
  }, [contextAgentId]);

  if (!user || user.role !== SystemRoles.ADMIN) {
    return null;
  }

  const handleSelectAgent = (agentId: string) => {
    setSelectedAgentId(agentId);
    setIsCreateMode(false);
  };

  const handleCreateNew = () => {
    setSelectedAgentId(undefined);
    setCurrentAgentId(undefined);
    setIsCreateMode(true);
  };

  const showAgentPanel = selectedAgentId !== undefined || isCreateMode;
  const emptyStateMessage =
    agents.length === 0
      ? localize('com_ui_create_new_agent')
      : localize('com_agents_empty_state_heading');

  return (
    <div className="flex h-screen w-full flex-col bg-surface-primary p-0 lg:p-2">
      <DashBreadcrumb />
      <div className="flex w-full flex-grow flex-col overflow-hidden p-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-text-primary">
            {localize('com_sidepanel_agent_builder')}
          </h1>
          <Button onClick={handleCreateNew} className="gap-2">
            <Plus className="size-5" />
            {localize('com_ui_create_new_agent')}
          </Button>
        </div>

        <div className="flex flex-1 gap-4 overflow-hidden">
          <div className="flex w-80 flex-col overflow-y-auto rounded-lg border border-border-medium bg-surface-primary shadow-sm">
            {isLoading ? (
              <div className="flex flex-1 items-center justify-center p-8">
                <Spinner className="size-8" />
              </div>
            ) : agents.length === 0 ? (
              <div className="p-8 text-center text-text-secondary">
                {localize('com_agents_empty_state_heading')}
              </div>
            ) : (
              <div className="divide-y divide-border-medium">
                {agents.map((agent) => {
                  const id = String(agent.id ?? agent._id ?? '');
                  const isSelected = selectedAgentId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleSelectAgent(id)}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-3 text-left text-text-primary transition-colors hover:bg-surface-hover',
                        isSelected ? 'bg-surface-secondary' : '',
                      )}
                    >
                      <Bot className="size-5 shrink-0 text-text-secondary" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{agent.name ?? id}</div>
                        {agent.description && (
                          <div className="truncate text-sm text-text-secondary">
                            {agent.description}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col overflow-y-auto rounded-lg border border-border-medium bg-surface-primary p-4 shadow-sm">
            {!showAgentPanel ? (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-text-secondary">{emptyStateMessage}</p>
              </div>
            ) : (
              <AgentPanel variant="page" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AgentsView() {
  return (
    <AgentPanelProvider>
      <AgentsViewContent />
    </AgentPanelProvider>
  );
}
