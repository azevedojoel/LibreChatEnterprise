import { useEffect, useRef } from 'react';
import { AgentPanelProvider, useAgentPanelContext } from '~/Providers/AgentPanelContext';
import { Panel, isEphemeralAgent } from '~/common';
import VersionPanel from './Version/VersionPanel';
import { useChatContext } from '~/Providers';
import ActionsPanel from './ActionsPanel';
import AgentPanel from './AgentPanel';

export default function AgentPanelSwitch() {
  return (
    <AgentPanelProvider>
      <AgentPanelSwitchWithContext />
    </AgentPanelProvider>
  );
}

function AgentPanelSwitchWithContext() {
  const { conversation } = useChatContext();
  const { activePanel, setCurrentAgentId } = useAgentPanelContext();
  const hasSyncedRef = useRef(false);

  // Sync from conversation only on initial mount when opening the Agent Builder.
  // After that, the Agent Builder is independent - user can select any agent without
  // the conversation overwriting their choice.
  useEffect(() => {
    if (hasSyncedRef.current) {
      return;
    }
    const agent_id = conversation?.agent_id ?? '';
    if (!isEphemeralAgent(agent_id)) {
      hasSyncedRef.current = true;
      setCurrentAgentId(agent_id);
    }
  }, [setCurrentAgentId, conversation?.agent_id]);

  if (activePanel === Panel.actions) {
    return <ActionsPanel />;
  }
  if (activePanel === Panel.version) {
    return <VersionPanel />;
  }
  return <AgentPanel />;
}
