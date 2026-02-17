import React, { useMemo } from 'react';
import { useRecoilValue, useRecoilCallback } from 'recoil';
import { Globe, TerminalSquareIcon, Box } from 'lucide-react';
import { VectorIcon } from '@librechat/client';
import type { BadgeItem } from '~/common';
import { Tools, AgentCapabilities, Constants } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';
import store from '~/store';
import { agentToolAtomFamily } from '~/store/badgeAtoms';

interface ChatBadgeConfig {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: TranslationKeys;
  atomKey: string;
}

const badgeConfig: ReadonlyArray<ChatBadgeConfig> = [
  { id: Tools.web_search, icon: Globe, label: 'com_ui_web_search', atomKey: Tools.web_search },
  {
    id: Tools.execute_code,
    icon: TerminalSquareIcon,
    label: 'com_assistants_code_interpreter',
    atomKey: Tools.execute_code,
  },
  {
    id: Tools.file_search,
    icon: VectorIcon,
    label: 'com_assistants_file_search',
    atomKey: Tools.file_search,
  },
  {
    id: AgentCapabilities.artifacts,
    icon: Box,
    label: 'com_ui_artifacts',
    atomKey: AgentCapabilities.artifacts,
  },
];

/**
 * Returns badge items for the agents BadgeRow.
 * @param conversationId - Conversation ID for per-conversation tool state
 */
export default function useChatBadges(conversationId?: string | null): BadgeItem[] {
  const localize = useLocalize();
  const key = conversationId ?? Constants.NEW_CONVO;
  const activeBadges = useRecoilValue(store.chatBadges) as Array<{ id: string }>;
  const activeBadgeIds = useMemo(
    () => new Set(activeBadges.map((badge) => badge.id)),
    [activeBadges],
  );

  const allBadges = useMemo(() => {
    return badgeConfig.map((cfg) => {
      const atomKey = `${key}__${cfg.atomKey}`;
      const atom = agentToolAtomFamily(atomKey);
      return {
        id: cfg.id,
        label: localize(cfg.label),
        icon: cfg.icon,
        atom,
        isAvailable: activeBadgeIds.has(cfg.id),
      };
    });
  }, [activeBadgeIds, localize, key]);

  return allBadges;
}

export function useResetChatBadges() {
  return useRecoilCallback(
    ({ reset }) =>
      () => {
        reset(store.chatBadges);
      },
    [],
  );
}

