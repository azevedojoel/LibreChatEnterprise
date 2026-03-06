import React, { memo, useMemo, useCallback } from 'react';
import { Badge } from '@librechat/client';
import { useRecoilValue, useRecoilCallback, useSetRecoilState } from 'recoil';
import { Constants, Tools, AgentCapabilities } from 'librechat-data-provider';
import type { BadgeItem } from '~/common';
import { useChatBadges } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';
import StackedMCPIcons from '~/components/MCP/StackedMCPIcons';
import ToolsDropdown from './ToolsDropdown';
import ToolDialogs from './ToolDialogs';
import { ephemeralAgentByConvoId, agentToolAtomFamily } from '~/store';

interface BadgeRowProps {
  showEphemeralBadges?: boolean;
  onToggle?: (badgeId: string, currentActive: boolean) => void;
  conversationId?: string | null;
  isSubmitting?: boolean;
  isInChat: boolean;
  disabled?: boolean;
}

interface BadgeWrapperProps {
  badge: BadgeItem;
  isInChat: boolean;
  brainstormMode: boolean;
  onToggle: (badge: BadgeItem) => void;
}

const BadgeWrapper = React.memo(({ badge, isInChat, brainstormMode, onToggle }: BadgeWrapperProps) => {
  const atomBadge = useRecoilValue(badge.atom);
  const isActive = badge.atom ? atomBadge : false;
  const isDisabledByBrainstorm = brainstormMode && badge.id !== 'brainstorm';
  const isBrainstormActive = badge.id === 'brainstorm' && isActive;

  return (
    <div className="badge-icon h-full">
      <Badge
        id={badge.id}
        icon={badge.icon}
        label={badge.label}
        isActive={isActive}
        isEditing={false}
        isAvailable={badge.isAvailable && !isDisabledByBrainstorm}
        isInChat={isInChat}
        onToggle={() => onToggle(badge)}
        className={isBrainstormActive ? 'bg-amber-100 dark:bg-amber-900/40' : undefined}
      />
    </div>
  );
});
BadgeWrapper.displayName = 'BadgeWrapper';

function BadgeRow({
  showEphemeralBadges,
  conversationId,
  onToggle,
  isInChat,
  disabled,
}: BadgeRowProps) {
  const key = conversationId ?? Constants.NEW_CONVO;
  const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(key));
  const { agentToolIds, mcpServerManager, brainstormMode } = useBadgeRowContext();

  const allBadges = useChatBadges(conversationId);
  const badges = useMemo(
    () =>
      allBadges.filter(
        (badge) =>
          badge.isAvailable !== false &&
          (!agentToolIds?.size || agentToolIds.has(badge.id)),
      ),
    [allBadges, agentToolIds],
  );

  const selectedMCPServers = useMemo(() => {
    const { mcpValues, selectableServers } = mcpServerManager;
    if (!selectableServers?.length || !mcpValues?.length) {
      return [];
    }
    const selectedSet = new Set(mcpValues);
    return selectableServers.filter((s) => selectedSet.has(s.serverName));
  }, [mcpServerManager.mcpValues, mcpServerManager.selectableServers]);

  const toggleBadge = useRecoilCallback(
    ({ snapshot, set }) =>
      async (badgeAtom: BadgeItem['atom'], badgeId: string): Promise<boolean> => {
        const current = await snapshot.getPromise(badgeAtom);
        const newValue = !current;
        set(badgeAtom, newValue);
        setEphemeralAgent((prev) => {
          const next = { ...(prev || {}), [badgeId]: newValue };
          if (badgeId === 'brainstorm' && newValue) {
            next[Tools.web_search] = false;
            next[Tools.file_search] = false;
            next[Tools.execute_code] = false;
            next[AgentCapabilities.artifacts] = false;
          } else if (badgeId !== 'brainstorm' && newValue && prev?.brainstorm) {
            next.brainstorm = false;
          }
          return next;
        });
        if (badgeId === 'brainstorm' && newValue) {
          [Tools.web_search, Tools.file_search, Tools.execute_code, AgentCapabilities.artifacts].forEach(
            (toolKey) => set(agentToolAtomFamily(`${key}__${toolKey}`), false),
          );
        } else if (badgeId !== 'brainstorm' && newValue) {
          set(agentToolAtomFamily(`${key}__brainstorm`), false);
        }
        return newValue;
      },
    [setEphemeralAgent, key],
  );

  const handleBadgeToggle = useCallback(
    async (badge: BadgeItem) => {
      let newActive = false;
      if (badge.atom) {
        if (brainstormMode && badge.id !== 'brainstorm') {
          return;
        }
        newActive = await toggleBadge(badge.atom, badge.id);
      }
      if (onToggle) {
        onToggle(badge.id, newActive);
      }
    },
    [toggleBadge, onToggle, brainstormMode],
  );

  if (showEphemeralBadges !== true) {
    return null;
  }

  return (
    <div className="flex h-9 items-center gap-2">
      <ToolsDropdown disabled={disabled || brainstormMode} />
      {badges.map((badge) => (
        <BadgeWrapper
          key={badge.id}
          badge={badge}
          isInChat={isInChat}
          brainstormMode={brainstormMode}
          onToggle={handleBadgeToggle}
        />
      ))}
      {selectedMCPServers.length > 0 && (
        <div className="flex items-center gap-1.5 rounded-lg border border-border-medium px-2 py-1">
          <StackedMCPIcons
            selectedServers={selectedMCPServers}
            maxIcons={3}
            iconSize="xs"
            variant="muted"
            spaced
          />
        </div>
      )}
      <ToolDialogs />
    </div>
  );
}

export default memo(BadgeRow);
