import React, { useMemo } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import MessageIcon from '~/components/Share/MessageIcon';
import { useAgentsMapContext } from '~/Providers';
import { useLocalize } from '~/hooks';

interface AgentReturnProps {
  sourceAgentId: string;
  agentId: string;
}

const AgentReturn: React.FC<AgentReturnProps> = ({ sourceAgentId, agentId }) => {
  const localize = useLocalize();
  const agentsMap = useAgentsMapContext();

  const sourceAgent = useMemo(() => {
    if (!sourceAgentId || !agentsMap) {
      return null;
    }
    return agentsMap[sourceAgentId];
  }, [agentsMap, sourceAgentId]);

  const targetAgent = useMemo(() => {
    if (!agentId || !agentsMap) {
      return null;
    }
    return agentsMap[agentId];
  }, [agentsMap, agentId]);

  return (
    <div className="my-3">
      <div className="flex items-center gap-2.5 text-sm text-text-secondary">
        <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
          <MessageIcon
            message={
              {
                endpoint: EModelEndpoint.agents,
                isCreatedByUser: false,
              } as TMessage
            }
            agent={targetAgent || undefined}
          />
        </div>
        <span className="select-none">{localize('com_ui_returned_from')}</span>
        <span className="select-none font-medium text-text-primary">
          {sourceAgent?.name || localize('com_ui_agent')}
        </span>
      </div>
    </div>
  );
};

export default AgentReturn;
