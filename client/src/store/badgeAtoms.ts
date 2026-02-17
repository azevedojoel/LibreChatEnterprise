/**
 * Recoil atoms for agent tool badges.
 * Key format: `${conversationId}__${toolKey}`. These stay in sync with ephemeralAgent.
 */
import { atomFamily } from 'recoil';
import { Tools, AgentCapabilities } from 'librechat-data-provider';

export const agentToolAtomFamily = atomFamily<boolean, string>({
  key: 'agentToolBadge',
  default: false,
});

export const AGENT_TOOL_IDS = [
  Tools.web_search,
  Tools.execute_code,
  Tools.file_search,
  AgentCapabilities.artifacts,
] as const;
