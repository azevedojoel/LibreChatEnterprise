import React, { memo, useMemo, useCallback } from 'react';
import { Badge } from '@librechat/client';
import { useRecoilValue, useRecoilCallback, useSetRecoilState } from 'recoil';
import { Constants } from 'librechat-data-provider';
import type { BadgeItem } from '~/common';
import { useChatBadges } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';
import StackedMCPIcons from '~/components/MCP/StackedMCPIcons';
import ToolsDropdown from './ToolsDropdown';
import ToolDialogs from './ToolDialogs';
import { ephemeralAgentByConvoId } from '~/store';

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
  onToggle: (badge: BadgeItem) => void;
}

const BadgeWrapper = React.memo(({ badge, isInChat, onToggle }: BadgeWrapperProps) => {
  const atomBadge = useRecoilValue(badge.atom);
  const isActive = badge.atom ? atomBadge : false;

  return (
    <div className="badge-icon h-full">
      <Badge
        id={badge.id}
        icon={badge.icon}
        label={badge.label}
        isActive={isActive}
        isEditing={false}
        isAvailable={badge.isAvailable}
        isInChat={isInChat}
        onToggle={() => onToggle(badge)}
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
  const { agentToolIds, mcpServerManager } = useBadgeRowContext();

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
        setEphemeralAgent((prev) => ({
          ...(prev || {}),
          [badgeId]: newValue,
        }));
        return newValue;
      },
    [setEphemeralAgent],
  );

  const handleBadgeToggle = useCallback(
    async (badge: BadgeItem) => {
      let newActive = false;
      if (badge.atom) {
        newActive = await toggleBadge(badge.atom, badge.id);
      }
      if (onToggle) {
        onToggle(badge.id, newActive);
      }
    },
    [toggleBadge, onToggle],
  );

  if (showEphemeralBadges !== true) {
    return null;
  }

  return (
    <div className="flex h-9 items-center gap-2">
      <ToolsDropdown disabled={disabled} />
      {badges.map((badge) => (
        <BadgeWrapper
          key={badge.id}
          badge={badge}
          isInChat={isInChat}
          onToggle={handleBadgeToggle}
        />
      ))}
      {selectedMCPServers.length > 0 && (
        <div className="flex items-center pl-1">
          <StackedMCPIcons
            selectedServers={selectedMCPServers}
            maxIcons={3}
            iconSize="xs"
            variant="muted"
          />
        </div>
      )}
      <ToolDialogs />
    </div>
  );
}

export default memo(BadgeRow);
