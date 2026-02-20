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
]);

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

export default {
  hideBannerHint,
  messageAttachmentsMap,
  conversationAttachmentsSelector,
  queriesEnabled,
  chatBadges,
  pendingMCPOAuthAtom,
};
