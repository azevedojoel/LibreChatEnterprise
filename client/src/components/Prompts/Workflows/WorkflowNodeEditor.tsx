import { memo, useCallback, useMemo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { ControlCombobox } from '@librechat/client';
import { useGetAllPromptGroups } from '~/data-provider';
import { useListAgentsQuery } from '~/data-provider/Agents';
import { PermissionBits } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import ToolPicker from '~/components/SidePanel/ScheduledAgents/ToolPicker';

/** Matches /command - name format; returns just the name part for display */
export function getAgentDisplayName(name: string | null | undefined): string {
  if (!name) return '';
  const match = name.match(/^\/(.+?) - (.+)$/);
  return match ? match[2] : name;
}

export type WorkflowNodeEditorData = {
  promptGroupId: string;
  agentId: string;
  selectedTools?: string[] | null;
  label?: string;
  isStart?: boolean;
  isEnd?: boolean;
  onPromptChange?: (nodeId: string, promptGroupId: string) => void;
  onAgentChange?: (nodeId: string, agentId: string) => void;
  onSelectedToolsChange?: (nodeId: string, selectedTools: string[] | null) => void;
};

function WorkflowNodeEditorComponent({ id, data, selected }: NodeProps<WorkflowNodeEditorData>) {
  const localize = useLocalize();
  const { data: promptGroups = [] } = useGetAllPromptGroups();
  const { data: agentsData } = useListAgentsQuery({
    limit: 100,
    requiredPermission: PermissionBits.VIEW,
  });
  const agents = agentsData?.data ?? [];

  const promptGroup = promptGroups.find((g) => g._id === data.promptGroupId);
  const agent = agents.find((a) => a.id === data.agentId);

  const promptItems = useMemo(
    () =>
      promptGroups.map((g) => ({
        value: g._id,
        label: g.command ? `/${g.command} - ${g.name}` : g.name,
      })),
    [promptGroups],
  );

  const agentItems = useMemo(
    () => agents.map((a) => ({ value: a.id, label: getAgentDisplayName(a.name) })),
    [agents],
  );

  const promptDisplayValue = promptGroup
    ? promptGroup.command
      ? `/${promptGroup.command} - ${promptGroup.name}`
      : promptGroup.name
    : '';

  const agentDisplayValue = getAgentDisplayName(agent?.name);

  const handlePromptChange = useCallback(
    (value: string) => {
      data.onPromptChange?.(id, value);
    },
    [id, data],
  );

  const handleAgentChange = useCallback(
    (value: string) => {
      data.onAgentChange?.(id, value);
    },
    [id, data],
  );

  const handleSelectedToolsChange = useCallback(
    (selectedTools: string[] | null) => {
      data.onSelectedToolsChange?.(id, selectedTools);
    },
    [id, data],
  );

  return (
    <div
      className={cn(
        'relative min-w-[200px] rounded-lg border-2 bg-surface-primary px-3 py-2 shadow-md text-text-primary',
        selected ? 'border-blue-500' : 'border-border-medium',
      )}
    >
      <Handle id="target-left" type="target" position={Position.Left} className="!bg-border-medium" />
      {(data.isStart || data.isEnd) && (
        <div className="mb-1 flex items-center justify-between gap-1">
          {data.isStart && (
            <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
              Start
            </span>
          )}
          <span className="flex-1" />
          {data.isEnd && (
            <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
              End
            </span>
          )}
        </div>
      )}
      <div className="space-y-2 text-xs">
        <div>
          <label className="mb-1 block text-text-secondary">Prompt</label>
          <ControlCombobox
            containerClassName="px-0"
            selectedValue={data.promptGroupId || ''}
            displayValue={promptDisplayValue}
            selectPlaceholder={localize('com_ui_select_options')}
            searchPlaceholder={localize('com_ui_search')}
            items={promptItems}
            setValue={handlePromptChange}
            ariaLabel={localize('com_ui_prompt')}
            isCollapsed={false}
            showCarat={true}
            className="h-8 min-h-0 text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-text-secondary">Agent</label>
          <ControlCombobox
            containerClassName="px-0"
            selectedValue={data.agentId || ''}
            displayValue={agentDisplayValue}
            selectPlaceholder={localize('com_ui_select_options')}
            searchPlaceholder={localize('com_agents_search_name')}
            items={agentItems}
            setValue={handleAgentChange}
            ariaLabel={localize('com_ui_agent')}
            isCollapsed={false}
            showCarat={true}
            className="h-8 min-h-0 text-xs"
          />
        </div>
        {data.agentId && (
          <div className="max-h-32 overflow-y-auto">
            <ToolPicker
              agentId={data.agentId}
              selectedTools={data.selectedTools ?? null}
              onChange={handleSelectedToolsChange}
            />
          </div>
        )}
      </div>
      <Handle id="source-right" type="source" position={Position.Right} className="!bg-border-medium" />
    </div>
  );
}

export const WorkflowNodeEditor = memo(WorkflowNodeEditorComponent);
