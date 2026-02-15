import { useEffect, useMemo, useState } from 'react';
import { Constants } from 'librechat-data-provider';
import { EModelEndpoint } from 'librechat-data-provider';
import { FilterInput, Label } from '@librechat/client';
import {
  useGetAgentByIdQuery,
  useAvailableToolsQuery,
  useMCPToolsQuery,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export type ToolOption = {
  id: string;
  name: string;
  description?: string;
  server?: string;
};

type Props = {
  agentId: string;
  selectedTools: string[] | null;
  onChange: (selectedTools: string[] | null) => void;
};

export default function ToolPicker({ agentId, selectedTools, onChange }: Props) {
  const localize = useLocalize();
  const [search, setSearch] = useState('');
  const [customModeActive, setCustomModeActive] = useState(false);

  const { data: agent } = useGetAgentByIdQuery(agentId, { enabled: !!agentId });
  const { data: regularTools = [] } = useAvailableToolsQuery(EModelEndpoint.agents, {
    enabled: !!agentId,
  });
  const { data: mcpData } = useMCPToolsQuery({ enabled: !!agentId });

  const toolOptions = useMemo((): ToolOption[] => {
    if (!agent?.tools?.length) return [];

    const options: ToolOption[] = [];
    const seen = new Set<string>();

    for (const toolId of agent.tools) {
      if (!toolId || typeof toolId !== 'string') continue;

      if (toolId.includes(Constants.mcp_delimiter)) {
        if (toolId.startsWith(Constants.mcp_server + Constants.mcp_delimiter)) {
          const serverName = toolId.split(Constants.mcp_delimiter).pop();
          if (serverName && mcpData?.servers?.[serverName]?.tools) {
            for (const t of mcpData.servers[serverName].tools) {
              const id = t.pluginKey;
              if (!seen.has(id)) {
                seen.add(id);
                options.push({
                  id,
                  name: t.name,
                  description: t.description,
                  server: serverName,
                });
              }
            }
          }
        } else {
          const parts = toolId.split(Constants.mcp_delimiter);
          const serverName = parts.pop();
          const toolName = parts.join(Constants.mcp_delimiter);
          if (serverName && mcpData?.servers?.[serverName]?.tools) {
            const t = mcpData.servers[serverName].tools.find(
              (x) => x.pluginKey === toolId || x.name === toolName,
            );
            if (t && !seen.has(toolId)) {
              seen.add(toolId);
              options.push({
                id: t.pluginKey,
                name: t.name,
                description: t.description,
                server: serverName,
              });
            }
          }
        }
      } else {
        const plugin = regularTools.find((p) => p.pluginKey === toolId);
        if (!seen.has(toolId)) {
          seen.add(toolId);
          options.push({
            id: toolId,
            name: plugin?.name ?? toolId,
            description: plugin?.description,
          });
        }
      }
    }

    return options.sort((a, b) => a.name.localeCompare(b.name));
  }, [agent?.tools, regularTools, mcpData]);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return toolOptions;
    const q = search.toLowerCase();
    return toolOptions.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description?.toLowerCase().includes(q)) ||
        (t.server?.toLowerCase().includes(q)),
    );
  }, [toolOptions, search]);

  const selectedSet = useMemo(() => {
    if (selectedTools === null) return null;
    return new Set(selectedTools);
  }, [selectedTools]);

  useEffect(() => {
    if (selectedTools === null && customModeActive) {
      setCustomModeActive(false);
    }
  }, [selectedTools, customModeActive]);

  const isAll = selectedTools === null;
  const isNone =
    Array.isArray(selectedTools) &&
    selectedTools.length === 0 &&
    !customModeActive;
  const isCustom =
    customModeActive || (Array.isArray(selectedTools) && selectedTools.length > 0);

  const handleModeChange = (mode: 'all' | 'none' | 'custom') => {
    if (mode === 'all') {
      setCustomModeActive(false);
      onChange(null);
    } else if (mode === 'none') {
      setCustomModeActive(false);
      onChange([]);
    } else {
      setCustomModeActive(true);
      onChange(toolOptions.map((t) => t.id));
    }
  };

  const handleToolToggle = (id: string) => {
    setCustomModeActive(true);
    const current = selectedTools === null ? toolOptions.map((t) => t.id) : selectedTools;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    onChange(next.length === toolOptions.length ? null : next);
  };

  const handleSelectAll = () => {
    setCustomModeActive(false);
    onChange(null);
  };
  const handleSelectNone = () => {
    setCustomModeActive(true);
    onChange([]);
  };

  if (!agentId || toolOptions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <Label>Tools for scheduled run</Label>
      <div className="flex flex-wrap gap-2">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="tool-mode"
            checked={isAll}
            onChange={() => handleModeChange('all')}
            className="rounded"
          />
          <span className="text-sm">Use all agent tools</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="tool-mode"
            checked={isNone}
            onChange={() => handleModeChange('none')}
            className="rounded"
          />
          <span className="text-sm">No tools</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="tool-mode"
            checked={isCustom}
            onChange={() => handleModeChange('custom')}
            className="rounded"
          />
          <span className="text-sm">Custom selection</span>
        </label>
      </div>

      {isCustom && (
        <div className="space-y-2 rounded-md border border-border-medium bg-surface-primary p-2">
          <FilterInput
            inputId="schedule-tool-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={localize('com_nav_tool_search')}
            containerClassName="w-full"
          />
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-text-secondary hover:text-text-primary hover:underline"
            >
              {localize('com_ui_select_all')}
            </button>
            <button
              type="button"
              onClick={handleSelectNone}
              className="text-text-secondary hover:text-text-primary hover:underline"
            >
              {localize('com_ui_deselect_all')}
            </button>
          </div>
          <div
            role="listbox"
            aria-multiselectable="true"
            className={cn(
              'max-h-48 space-y-1 overflow-y-auto',
              filteredOptions.length > 5 && 'pr-1',
            )}
          >
            {filteredOptions.length === 0 ? (
              <p className="py-2 text-sm text-text-secondary">No tools match</p>
            ) : (
              filteredOptions.map((tool) => {
                const checked =
                  selectedSet === null ? true : selectedSet.has(tool.id);
                return (
                  <div
                    key={tool.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded border p-1.5',
                      'border-token-border-light hover:bg-token-surface-secondary',
                    )}
                    onClick={() => handleToolToggle(tool.id)}
                    onKeyDown={(e) => {
                      if (e.key === ' ') {
                        e.preventDefault();
                        handleToolToggle(tool.id);
                      }
                    }}
                    role="option"
                    tabIndex={0}
                    aria-selected={checked}
                  >
                    <input
                      type="checkbox"
                      id={`tool-${tool.id}`}
                      checked={checked}
                      onChange={() => handleToolToggle(tool.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 shrink-0 rounded border-border-xheavy"
                      aria-label={tool.name}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{tool.name}</span>
                      {tool.server && (
                        <span className="block truncate text-xs text-text-tertiary">
                          {tool.server}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
