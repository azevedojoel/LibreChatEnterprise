import React, { useMemo } from 'react';
import * as Ariakit from '@ariakit/react';
import { Globe, TerminalSquareIcon, Box, Wrench } from 'lucide-react';
import { VectorIcon } from '@librechat/client';
import { EModelEndpoint, Tools, AgentCapabilities } from 'librechat-data-provider';
import type { TMessage, TConversation } from 'librechat-data-provider';
import { useAvailableToolsQuery } from '~/data-provider';
import { cn } from '~/utils';

interface MessageToolsIconsProps {
  message: TMessage | undefined;
  conversation: TConversation | null;
  isLast?: boolean;
}

const BUILT_IN_ICONS: Record<string, React.ComponentType<{ className?: string; size?: number }>> = {
  [Tools.file_search]: VectorIcon,
  [Tools.web_search]: Globe,
  [Tools.execute_code]: TerminalSquareIcon,
  [AgentCapabilities.artifacts]: Box,
};

function getToolIcon(toolId: string): React.ComponentType<{ className?: string; size?: number }> {
  return BUILT_IN_ICONS[toolId] ?? Wrench;
}

function getToolDisplayName(
  toolId: string,
  toolsMap: Map<string, { name: string }>,
): string {
  const tool = toolsMap.get(toolId);
  if (tool?.name) return tool.name;
  if (toolId.startsWith('mcp_') && toolId.includes('::')) {
    const [, toolName] = toolId.split('::');
    return toolName ?? toolId;
  }
  const labels: Record<string, string> = {
    [Tools.file_search]: 'File Search',
    [Tools.web_search]: 'Web Search',
    [Tools.execute_code]: 'Code Interpreter',
    [AgentCapabilities.artifacts]: 'Artifacts',
  };
  return labels[toolId] ?? toolId;
}

export default function MessageToolsIcons({ message, conversation, isLast = true }: MessageToolsIconsProps) {
  const { data: availableTools = [] } = useAvailableToolsQuery(EModelEndpoint.agents);

  const popoverStore = Ariakit.usePopoverStore({
    placement: 'top',
  });
  const isOpen = popoverStore.useState('open');

  const toolsMap = useMemo(() => {
    const map = new Map<string, { name: string }>();
    for (const t of availableTools) {
      const key = t.pluginKey ?? (t as { tool_id?: string }).tool_id ?? t.name;
      if (key) map.set(key, { name: t.name ?? key });
    }
    return map;
  }, [availableTools]);

  const shouldShow = useMemo(() => {
    if (!message) return false;
    if (message.isCreatedByUser) return false;
    const isAgents =
      message.endpoint === EModelEndpoint.agents ||
      conversation?.endpoint === EModelEndpoint.agents ||
      conversation?.endpointType === EModelEndpoint.agents;
    return !!isAgents;
  }, [message, conversation]);

  const tools = useMemo(() => {
    if (!shouldShow) return [];
    const raw = message?.metadata?.tools;
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw)].filter(Boolean);
  }, [shouldShow, message?.metadata?.tools]);

  if (!shouldShow) return null;

  const buttonStyle = cn(
    'hover-button rounded-lg p-1.5 text-text-secondary-alt',
    'hover:text-text-primary hover:bg-surface-hover',
    'md:group-hover:visible md:group-focus-within:visible md:group-[.final-completion]:visible',
    !isLast && 'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100',
    'focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white focus-visible:outline-none',
    isOpen && 'active text-text-primary bg-surface-hover',
  );

  return (
    <>
      <Ariakit.PopoverAnchor
        store={popoverStore}
        render={
          <button
            className={buttonStyle}
            onClick={() => popoverStore.toggle()}
            type="button"
            title="Tools sent to model"
            aria-label="Tools sent to model"
            data-testid="message-tools-icons"
          >
            <Wrench className="h-[19px] w-[19px]" aria-hidden="true" />
          </button>
        }
      />
      <Ariakit.Popover
        store={popoverStore}
        gutter={10}
        className={cn(
          'popover-animate flex flex-col overflow-hidden rounded-2xl border border-border-medium',
          'bg-surface-secondary p-2 shadow-lg',
          isOpen && 'open',
        )}
        style={{
          outline: 'none',
          pointerEvents: 'auto',
          zIndex: 50,
        }}
        portal={true}
        unmountOnHide={true}
      >
        <div className="flex flex-col gap-1 py-1">
          {tools.length > 0 ? (
            tools.map((toolId) => {
              const Icon = getToolIcon(toolId);
              const label = getToolDisplayName(toolId, toolsMap);
              return (
                <div
                  key={toolId}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-text-primary"
                  role="listitem"
                >
                  <Icon className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
                  <span>{label}</span>
                </div>
              );
            })
          ) : (
            <div
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-text-tertiary"
              role="listitem"
            >
              <Wrench className="size-4 shrink-0" aria-hidden="true" />
              <span>No tools sent to model</span>
            </div>
          )}
        </div>
      </Ariakit.Popover>
    </>
  );
}
