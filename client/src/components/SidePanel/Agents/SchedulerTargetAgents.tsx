import React, { useState, useMemo, useCallback } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import { X, Calendar } from 'lucide-react';
import {
  HoverCard,
  CircleHelpIcon,
  HoverCardPortal,
  ControlCombobox,
  HoverCardContent,
  HoverCardTrigger,
} from '@librechat/client';
import type { TMessage } from 'librechat-data-provider';
import type { ControllerRenderProps } from 'react-hook-form';
import type { AgentForm, OptionWithIcon } from '~/common';
import MessageIcon from '~/components/Share/MessageIcon';
import { useAgentsMapContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { ESide } from '~/common';

interface SchedulerTargetAgentsProps {
  field: ControllerRenderProps<AgentForm, 'schedulerTargetAgentIds'>;
  currentAgentId: string;
}

const SchedulerTargetAgents: React.FC<SchedulerTargetAgentsProps> = ({
  field,
  currentAgentId,
}) => {
  const localize = useLocalize();
  const [newAgentId, setNewAgentId] = useState('');
  const agentsMap = useAgentsMapContext();
  const value = field.value ?? [];

  const agents = useMemo(() => (agentsMap ? Object.values(agentsMap) : []), [agentsMap]);

  const selectableAgents = useMemo(
    () =>
      agents
        .filter((agent) => agent?.id !== currentAgentId && !value.includes(agent?.id ?? ''))
        .map(
          (agent) =>
            ({
              label: agent?.name || '',
              value: agent?.id || '',
              icon: (
                <MessageIcon
                  message={
                    {
                      endpoint: EModelEndpoint.agents,
                      isCreatedByUser: false,
                    } as TMessage
                  }
                  agent={agent}
                />
              ),
            }) as OptionWithIcon,
        ),
    [agents, currentAgentId, value],
  );

  const getAgentDetails = useCallback((id: string) => agentsMap?.[id], [agentsMap]);

  const removeAt = useCallback(
    (index: number) => {
      field.onChange(value.filter((_, i) => i !== index));
    },
    [value, field],
  );

  React.useEffect(() => {
    if (newAgentId && !value.includes(newAgentId)) {
      field.onChange([...value, newAgentId]);
      setNewAgentId('');
    }
  }, [newAgentId, value, field]);

  return (
    <HoverCard openDelay={50}>
      <div className="my-2 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <label className="font-semibold text-text-primary">
            {localize('com_agents_scheduler_target_agents')}
          </label>
          <HoverCardTrigger asChild>
            <button
              type="button"
              className="inline-flex"
              aria-label={localize('com_agents_scheduler_target_agents_info')}
            >
              <CircleHelpIcon className="h-4 w-4 text-text-tertiary" />
            </button>
          </HoverCardTrigger>
        </div>
        <div className="space-y-1">
          {value.map((agentId, idx) => (
            <div
              key={agentId}
              className="flex h-10 items-center gap-2 rounded-md border border-border-medium bg-surface-tertiary pr-2"
            >
              <MessageIcon
                message={
                  {
                    endpoint: EModelEndpoint.agents,
                    isCreatedByUser: false,
                  } as TMessage
                }
                agent={agentsMap?.[agentId]}
              />
              <span className="flex-1 truncate text-sm text-text-primary">
                {getAgentDetails(agentId)?.name ?? agentId}
              </span>
              <button
                type="button"
                className="rounded-xl p-1 transition hover:bg-surface-hover"
                onClick={() => removeAt(idx)}
                aria-label={localize('com_ui_remove')}
              >
                <X size={18} className="text-text-secondary" />
              </button>
            </div>
          ))}
          <ControlCombobox
            isCollapsed={false}
            ariaLabel={localize('com_agents_scheduler_target_agents_placeholder')}
            selectedValue=""
            setValue={setNewAgentId}
            selectPlaceholder={localize('com_agents_scheduler_target_agents_placeholder')}
            searchPlaceholder={localize('com_ui_agent_var', { 0: localize('com_ui_search') })}
            items={selectableAgents}
            className="h-10 w-full border-dashed border-border-heavy text-center text-text-secondary hover:text-text-primary"
            containerClassName="px-0"
            SelectIcon={<Calendar size={16} className="text-text-secondary" />}
          />
        </div>
      </div>
      <HoverCardPortal>
        <HoverCardContent side={ESide.Top} className="w-80">
          <div className="space-y-2">
            <p className="text-sm text-text-secondary">
              {localize('com_agents_scheduler_target_agents_info')}
            </p>
          </div>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
};

export default SchedulerTargetAgents;
