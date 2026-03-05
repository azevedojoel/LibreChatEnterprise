import { useState, useCallback, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { ChevronDown } from 'lucide-react';
import store from '~/store';
import { EModelEndpoint } from 'librechat-data-provider';
import type t from 'librechat-data-provider';
import { useNewConvo, useLocalize } from '~/hooks';
import { useAssistantsMapContext, useAgentsMapContext } from '~/Providers';
import useSelectMention from '~/hooks/Input/useSelectMention';
import { useGetEndpointsQuery } from '~/data-provider';
import { cn } from '~/utils';
import AgentNavItem from './AgentNavItem';

interface AgentsNavProps {
  isSmallScreen?: boolean;
  toggleNav?: () => void;
}

export default function AgentsNav({ isSmallScreen, toggleNav }: AgentsNavProps) {
  const localize = useLocalize();
  const [isExpanded, setIsExpanded] = useState(true);

  const selectedProjectId = useRecoilValue(store.selectedProjectIdAtom);
  const search = useRecoilValue(store.search);
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const { newConversation } = useNewConvo();
  const assistantsMap = useAssistantsMapContext();
  const agentsMap = useAgentsMapContext();
  const { data: endpointsConfig = {} as t.TEndpointsConfig } = useGetEndpointsQuery();

  const { onSelectEndpoint } = useSelectMention({
    modelSpecs: [],
    conversation,
    assistantsMap,
    endpointsConfig,
    newConversation,
    returnHandlers: true,
    userProjectId: selectedProjectId ?? undefined,
  });

  const agentsList = useMemo(() => {
    if (!agentsMap) {
      return [];
    }
    return Object.values(agentsMap).sort((a, b) =>
      (a.name ?? '').localeCompare(b.name ?? ''),
    );
  }, [agentsMap]);

  const handleSelectAgent = useCallback(
    (endpoint?: EModelEndpoint | string | null, kwargs?: { agent_id?: string }) => {
      onSelectEndpoint?.(endpoint, kwargs);
      if (isSmallScreen && toggleNav) {
        toggleNav();
      }
    },
    [onSelectEndpoint, isSmallScreen, toggleNav],
  );

  const handleRemoveFocus = useCallback(() => {
    const nextItem = document.querySelector<HTMLElement>('[data-testid="agent-nav-item"]');
    if (nextItem) {
      nextItem.focus();
      return;
    }
    const newChatButton = document.querySelector<HTMLElement>(
      '[data-testid="nav-new-chat-button"]',
    );
    newChatButton?.focus();
  }, []);

  const agentsEndpointEnabled = !!endpointsConfig?.[EModelEndpoint.agents];
  const hasAgents = agentsList.length > 0;

  if (search.query || !agentsEndpointEnabled || !hasAgents) {
    return null;
  }

  return (
    <div className="mb-1">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="group flex w-full items-center justify-between rounded-lg px-1 py-2 text-xs font-bold text-text-secondary outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
        type="button"
      >
        <span className="select-none">{localize('com_nav_agents')}</span>
        <ChevronDown
          className={cn('h-3 w-3 transition-transform duration-200', isExpanded && 'rotate-180')}
          aria-hidden
        />
      </button>

      {isExpanded && (
        <div className="mt-1 max-h-48 overflow-y-auto">
          <div className="flex flex-col gap-1">
            {agentsList.map((agent) => (
              <AgentNavItem
                key={agent.id}
                agent={agent}
                onSelectEndpoint={handleSelectAgent}
                onRemoveFocus={handleRemoveFocus}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
