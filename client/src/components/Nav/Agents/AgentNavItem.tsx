import React, { useState } from 'react';
import * as Menu from '@ariakit/react/menu';
import { Ellipsis, Pin, PinOff } from 'lucide-react';
import { DropdownPopup } from '@librechat/client';
import { EModelEndpoint } from 'librechat-data-provider';
import type t from 'librechat-data-provider';
import { useFavorites, useLocalize } from '~/hooks';
import { renderAgentAvatar, cn } from '~/utils';

type Kwargs = {
  model?: string;
  agent_id?: string;
  assistant_id?: string;
  spec?: string | null;
};

type AgentNavItemProps = {
  agent: t.Agent;
  onSelectEndpoint?: (endpoint?: EModelEndpoint | string | null, kwargs?: Kwargs) => void;
  onRemoveFocus?: () => void;
};

export default function AgentNavItem({
  agent,
  onSelectEndpoint,
  onRemoveFocus,
}: AgentNavItemProps) {
  const localize = useLocalize();
  const { addFavoriteAgent, removeFavoriteAgent, isFavoriteAgent } = useFavorites();
  const [isPopoverActive, setIsPopoverActive] = useState(false);

  const isPinned = isFavoriteAgent(agent.id);

  const handleSelect = () => {
    onSelectEndpoint?.(EModelEndpoint.agents, { agent_id: agent.id });
  };

  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-testid="agent-nav-options-button"]')) {
      return;
    }
    handleSelect();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect();
    }
  };

  const handlePinToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPinned) {
      removeFavoriteAgent(agent.id);
    } else {
      addFavoriteAgent(agent.id);
    }
    setIsPopoverActive(false);
    requestAnimationFrame(() => {
      onRemoveFocus?.();
    });
  };

  const name = agent.name ?? '';
  const ariaLabel = `${name} (${localize('com_ui_agent')})`;
  const menuId = React.useId();

  const dropdownItems = [
    {
      label: isPinned ? localize('com_ui_unpin') : localize('com_ui_pin'),
      onClick: handlePinToggle,
      icon: isPinned ? (
        <PinOff className="h-4 w-4 text-text-secondary" />
      ) : (
        <Pin className="h-4 w-4 text-text-secondary" />
      ),
    },
  ];

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      className={cn(
        'group relative flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm text-text-primary outline-none hover:bg-surface-active-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white',
        isPopoverActive ? 'bg-surface-active-alt' : '',
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-testid="agent-nav-item"
    >
      <div className="flex flex-1 items-center truncate pr-6">
        {renderAgentAvatar(agent, { size: 'icon', className: 'mr-2' })}
        <span className="truncate">{name}</span>
      </div>

      <div
        className={cn(
          'absolute right-2 flex items-center',
          isPopoverActive
            ? 'opacity-100'
            : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownPopup
          portal={true}
          mountByState={true}
          isOpen={isPopoverActive}
          setIsOpen={setIsPopoverActive}
          className="z-[125]"
          trigger={
            <Menu.MenuButton
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-md border-none p-0 text-sm font-medium ring-ring-primary transition-all duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50',
                isPopoverActive
                  ? 'opacity-100'
                  : 'opacity-0 focus:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 data-[open]:opacity-100',
              )}
              aria-label={localize('com_nav_convo_menu_options')}
              data-testid="agent-nav-options-button"
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.stopPropagation();
              }}
              onKeyDown={(e: React.KeyboardEvent<HTMLButtonElement>) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                }
              }}
            >
              <Ellipsis className="icon-md text-text-secondary" aria-hidden={true} />
            </Menu.MenuButton>
          }
          items={dropdownItems}
          menuId={menuId}
        />
      </div>
    </div>
  );
}
