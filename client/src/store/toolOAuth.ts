import { atom } from 'jotai';

/**
 * Pending OAuth state for tool calls during chat.
 * When set, the ToolOAuthOverlay shows a full-view login modal.
 * Cleared when: user cancels, tool completes (success or error), or tool is cancelled.
 */
export interface PendingToolOAuth {
  auth: string;
  name: string;
  serverName: string;
  authDomain: string;
  /** For MCP tools - enables Cancel button */
  isMCP: boolean;
  /** For Action tools */
  actionId?: string;
}

export const pendingToolOAuthAtom = atom<PendingToolOAuth | null>(null);
