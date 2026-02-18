import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { useGetAllPromptGroups } from '~/data-provider';
import { useListAgentsQuery } from '~/data-provider/Agents';
import { PermissionBits } from 'librechat-data-provider';
import { cn } from '~/utils';
import { getAgentDisplayName } from './WorkflowNodeEditor';

export type WorkflowNodeData = {
  promptGroupId: string;
  agentId: string;
  label?: string;
};

function WorkflowNodeComponent({ data, selected }: NodeProps<WorkflowNodeData>) {
  const { data: promptGroups = [] } = useGetAllPromptGroups();
  const { data: agentsData } = useListAgentsQuery({
    limit: 100,
    requiredPermission: PermissionBits.VIEW,
  });
  const agents = agentsData?.data ?? [];

  const promptGroup = promptGroups.find((g) => g._id === data.promptGroupId);
  const agent = agents.find((a) => a.id === data.agentId);

  const promptLabel = promptGroup
    ? promptGroup.command
      ? `/${promptGroup.command} - ${promptGroup.name}`
      : promptGroup.name
    : '—';
  const agentLabel = getAgentDisplayName(agent?.name) || '—';

  return (
    <div
      className={cn(
        'relative min-w-[180px] rounded-lg border-2 bg-surface-primary px-3 py-2 shadow-md',
        selected ? 'border-blue-500' : 'border-border-medium',
      )}
    >
      <Handle id="target-left" type="target" position={Position.Left} className="!bg-border-medium" />
      <div className="space-y-1 text-xs">
        <div>
          <span className="text-text-secondary">Prompt: </span>
          <span className="font-medium text-text-primary truncate block">{promptLabel}</span>
        </div>
        <div>
          <span className="text-text-secondary">Agent: </span>
          <span className="font-medium text-text-primary truncate block">{agentLabel}</span>
        </div>
      </div>
      <Handle id="source-right" type="source" position={Position.Right} className="!bg-border-medium" />
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);
