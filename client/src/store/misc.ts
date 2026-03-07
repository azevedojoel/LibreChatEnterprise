import { atom, selectorFamily } from 'recoil';
import { TAttachment } from 'librechat-data-provider';
import { atomWithLocalStorage } from './utils';

const hideBannerHint = atomWithLocalStorage('hideBannerHint', [] as string[]);

const messageAttachmentsMap = atom<Record<string, TAttachment[] | undefined>>({
  key: 'messageAttachmentsMap',
  default: {},
});

/**
 * Selector to get attachments for a specific conversation.
 */
const conversationAttachmentsSelector = selectorFamily<
  Record<string, TAttachment[]>,
  string | undefined
>({
  key: 'conversationAttachments',
  get:
    (conversationId) =>
    ({ get }) => {
      if (!conversationId) {
        return {};
      }

      const attachmentsMap = get(messageAttachmentsMap);
      const result: Record<string, TAttachment[]> = {};

      // Filter to only include attachments for this conversation
      Object.entries(attachmentsMap).forEach(([messageId, attachments]) => {
        if (!attachments || attachments.length === 0) {
          return;
        }

        const relevantAttachments = attachments.filter(
          (attachment) => attachment.conversationId === conversationId,
        );

        if (relevantAttachments.length > 0) {
          result[messageId] = relevantAttachments;
        }
      });

      return result;
    },
});

const queriesEnabled = atom<boolean>({
  key: 'queriesEnabled',
  default: true,
});

const chatBadges = atomWithLocalStorage<Array<{ id: string }>>('chatBadges', [
  // Agent tool badges - when adding new badges, add to useChatBadges.ts as last item
  { id: 'web_search' },
  { id: 'execute_code' },
  { id: 'file_search' },
  { id: 'artifacts' },
  { id: 'brainstorm' },
]);

/** Selected user project ID for filtering conversations in sidebar (null = all) */
export const selectedProjectIdAtom = atomWithLocalStorage<string | null>('selectedProjectId', null);

/** Nav section expanded state - persists across refresh */
export const agentsNavExpandedAtom = atomWithLocalStorage<boolean>('agentsNavExpanded', true);
export const projectsNavExpandedAtom = atomWithLocalStorage<boolean>('projectsNavExpanded', true);
export const schedulesNavExpandedAtom = atomWithLocalStorage<boolean>('schedulesNavExpanded', true);

/** Help hint IDs the user has interacted with - after first click, icon shows on hover only */
export const dismissedHelpHintsAtom = atomWithLocalStorage<string[]>('dismissedHelpHints', []);

/** Pending OAuth for MCP or Action tools - overlay shows Sign-in/Cancel (bypasses cache update delay) */
export interface PendingMCPOAuth {
  authUrl: string;
  toolName: string;
  /** MCP server name - for MCP tools */
  serverName?: string;
  /** Action ID - for Action tools (Custom Actions with OAuth) */
  actionId?: string;
}

export const pendingMCPOAuthAtom = atom<PendingMCPOAuth | null>({
  key: 'pendingMCPOAuth',
  default: null,
});

/** Pending tool confirmation - modal shows Approve/Deny for destructive tools */
export interface PendingToolConfirmation {
  conversationId: string;
  runId: string;
  toolCallId: string;
  toolName: string;
  argsSummary?: string;
  /** When true, approval is routed to another user (e.g. human_await_response memberId); conversation owner cannot approve */
  waitingForApprover?: boolean;
  approverName?: string;
}

/** Map of toolCallId -> PendingToolConfirmation (supports parallel tool confirmations) */
export const pendingToolConfirmationAtom = atom<Record<string, PendingToolConfirmation>>({
  key: 'pendingToolConfirmation',
  default: {},
});

/** Map of toolCallId -> subAgentStreamId[] for run_sub_agent progress. Set when sub_agent_started is received. Supports multiple parallel sub-agents per tool call. */
export const subAgentStreamByToolCallIdAtom = atom<Record<string, string[]>>({
  key: 'subAgentStreamByToolCallId',
  default: {},
});

/** Persisted expanded state for tool call JSON - survives navigation. Key: conversationId:messageId:toolCallId */
export const expandedToolCallsAtom = atom<Set<string>>({
  key: 'expandedToolCalls',
  default: new Set(),
});

/**
 * Resolved tool approvals - tools that required approval and user approved/denied.
 * Key: conversationId:messageId:toolCallId. Value: 'approved' | 'denied'.
 * Used to show "Approved"/"Denied" only for tools that actually went through the approval flow.
 */
export const resolvedToolApprovalsAtom = atom<Record<string, 'approved' | 'denied'>>({
  key: 'resolvedToolApprovals',
  default: {},
});

export default {
  hideBannerHint,
  messageAttachmentsMap,
  conversationAttachmentsSelector,
  queriesEnabled,
  chatBadges,
  selectedProjectIdAtom,
  agentsNavExpandedAtom,
  projectsNavExpandedAtom,
  schedulesNavExpandedAtom,
  dismissedHelpHintsAtom,
  pendingMCPOAuthAtom,
  pendingToolConfirmationAtom,
  subAgentStreamByToolCallIdAtom,
  expandedToolCallsAtom,
  resolvedToolApprovalsAtom,
};
