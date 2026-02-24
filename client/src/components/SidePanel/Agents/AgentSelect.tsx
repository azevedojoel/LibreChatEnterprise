import { EarthIcon } from 'lucide-react';
import { ControlCombobox } from '@librechat/client';
import { useCallback, useEffect, useRef } from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import {
  AgentCapabilities,
  Tools,
  EToolResources,
  defaultAgentFormValues,
} from 'librechat-data-provider';
import type { UseMutationResult, QueryObserverResult } from '@tanstack/react-query';
import type { Agent, AgentCreateParams } from 'librechat-data-provider';
import type { TAgentCapabilities, AgentForm } from '~/common';
import {
  cn,
  createProviderOption,
  processAgentOption,
  getDefaultAgentFormValues,
  getAbsoluteImageUrl,
} from '~/utils';
import { useLocalize, useAgentDefaultPermissionLevel } from '~/hooks';
import { useListAgentsQuery } from '~/data-provider';

const keys = new Set(Object.keys(defaultAgentFormValues));

export default function AgentSelect({
  agentQuery,
  selectedAgentId = null,
  setCurrentAgentId,
  createMutation,
}: {
  selectedAgentId: string | null;
  agentQuery: QueryObserverResult<Agent>;
  setCurrentAgentId: React.Dispatch<React.SetStateAction<string | undefined>>;
  createMutation: UseMutationResult<Agent, Error, AgentCreateParams>;
}) {
  const localize = useLocalize();
  const lastSelectedAgent = useRef<string | null>(null);
  const { control, reset } = useFormContext();
  const permissionLevel = useAgentDefaultPermissionLevel();

  const { data: agents = null } = useListAgentsQuery(
    { requiredPermission: permissionLevel },
    {
      select: (res) =>
        res.data.map((agent) =>
          processAgentOption({
            agent: {
              ...agent,
              name: agent.name || agent.id,
            },
          }),
        ),
    },
  );

  const resetAgentForm = useCallback(
    (fullAgent: Agent) => {
      const isGlobal = fullAgent.isPublic ?? false;
      const update = {
        ...fullAgent,
        provider: createProviderOption(fullAgent.provider),
        label: fullAgent.name ?? '',
        value: fullAgent.id || '',
        icon: isGlobal ? <EarthIcon className={'icon-lg text-green-400'} /> : null,
      };

      const capabilities: TAgentCapabilities = {
        [AgentCapabilities.web_search]: false,
        [AgentCapabilities.file_search]: false,
        [AgentCapabilities.execute_code]: false,
        [AgentCapabilities.manage_scheduling]: false,
        [AgentCapabilities.manage_crm]: false,
        [AgentCapabilities.end_after_tools]: false,
        [AgentCapabilities.hide_sequential_outputs]: false,
      };

      const schedulingToolSet = new Set([
        Tools.list_schedules,
        Tools.create_schedule,
        Tools.update_schedule,
        Tools.delete_schedule,
        Tools.run_schedule,
        Tools.list_runs,
        Tools.get_run,
      ]);

      const crmToolSet = new Set([
        Tools.crm_create_contact,
        Tools.crm_update_contact,
        Tools.crm_get_contact,
        Tools.crm_list_contacts,
        Tools.crm_create_organization,
        Tools.crm_create_deal,
        Tools.crm_update_deal,
        Tools.crm_list_deals,
        Tools.crm_log_activity,
        Tools.crm_list_activities,
        Tools.crm_list_pipelines,
        Tools.crm_create_pipeline,
        Tools.crm_update_pipeline,
        Tools.crm_soft_delete_contact,
        Tools.crm_soft_delete_organization,
        Tools.crm_soft_delete_deal,
        Tools.crm_soft_delete_pipeline,
      ]);

      const agentTools: string[] = [];
      (fullAgent.tools ?? []).forEach((tool) => {
        if (capabilities[tool] !== undefined) {
          capabilities[tool] = true;
          return;
        }
        if (
          tool === Tools.workspace_read_file ||
          tool === Tools.workspace_edit_file ||
          tool === Tools.workspace_create_file ||
          tool === Tools.workspace_delete_file ||
          tool === Tools.workspace_list_files ||
          tool === Tools.search_user_files ||
          tool === Tools.workspace_glob_files
        ) {
          capabilities[AgentCapabilities.execute_code] = true;
          return;
        }
        if (schedulingToolSet.has(tool)) {
          capabilities[AgentCapabilities.manage_scheduling] = true;
          if (!agentTools.includes(AgentCapabilities.manage_scheduling)) {
            agentTools.push(AgentCapabilities.manage_scheduling);
          }
          return;
        }
        if (crmToolSet.has(tool)) {
          capabilities[AgentCapabilities.manage_crm] = true;
          if (!agentTools.includes(AgentCapabilities.manage_crm)) {
            agentTools.push(AgentCapabilities.manage_crm);
          }
          return;
        }

        agentTools.push(tool);
      });

      const formValues: Partial<AgentForm & TAgentCapabilities> = {
        ...capabilities,
        agent: update,
        model: update.model,
        tools: agentTools,
        // Ensure the category is properly set for the form
        category: fullAgent.category || 'general',
        // Make sure support_contact is properly loaded
        support_contact: fullAgent.support_contact,
        avatar_file: null,
        avatar_preview: getAbsoluteImageUrl(fullAgent.avatar?.filepath) ?? '',
        avatar_action: null,
      };

      Object.entries(fullAgent).forEach(([name, value]) => {
        if (name === 'model_parameters') {
          formValues[name] = value;
          return;
        }

        if (capabilities[name] !== undefined) {
          formValues[name] = value;
          return;
        }

        if (
          name === 'agent_ids' &&
          Array.isArray(value) &&
          value.every((item) => typeof item === 'string')
        ) {
          formValues[name] = value;
          return;
        }

        if (name === 'edges' && Array.isArray(value)) {
          formValues[name] = value;
          return;
        }

        if (
          name === 'schedulerTargetAgentIds' &&
          Array.isArray(value) &&
          value.every((item) => typeof item === 'string')
        ) {
          formValues[name] = value;
          return;
        }

        if (
          name === 'projectIds' &&
          Array.isArray(value) &&
          value.every((item) => typeof item === 'string')
        ) {
          formValues[name] = value;
          return;
        }

        if (name === 'inboundEmailToken' && (value === null || typeof value === 'string')) {
          formValues[name] = value ?? '';
          return;
        }

        if (name === 'tool_options' && typeof value === 'object' && value !== null) {
          formValues[name] = value;
          return;
        }

        if (!keys.has(name)) {
          return;
        }

        if (name === 'recursion_limit' && typeof value === 'number') {
          formValues[name] = value;
          return;
        }

        if (typeof value !== 'number' && typeof value !== 'object') {
          formValues[name] = value;
        }
      });

      reset(formValues);
    },
    [reset],
  );

  const onSelect = useCallback(
    (selectedId: string) => {
      const agentExists = !!(selectedId
        ? (agents ?? []).find((agent) => agent.id === selectedId)
        : undefined);

      createMutation.reset();
      if (!agentExists) {
        setCurrentAgentId(undefined);
        return reset(getDefaultAgentFormValues());
      }

      setCurrentAgentId(selectedId);
      const agent = agentQuery.data;
      if (!agent) {
        console.warn('Agent not found');
        return;
      }

      resetAgentForm(agent);
    },
    [agents, createMutation, setCurrentAgentId, agentQuery.data, resetAgentForm, reset],
  );

  useEffect(() => {
    if (agentQuery.data && agentQuery.isSuccess) {
      resetAgentForm(agentQuery.data);
    }
  }, [agentQuery.data, agentQuery.isSuccess, resetAgentForm]);

  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;

    if (selectedAgentId === lastSelectedAgent.current) {
      return;
    }

    if (selectedAgentId != null && selectedAgentId !== '' && agents) {
      timerId = setTimeout(() => {
        lastSelectedAgent.current = selectedAgentId;
        onSelect(selectedAgentId);
      }, 5);
    }

    return () => {
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [selectedAgentId, agents, onSelect]);

  const createAgent = localize('com_ui_create_new_agent');

  return (
    <Controller
      name="agent"
      control={control}
      render={({ field }) => (
        <ControlCombobox
          containerClassName="px-0"
          selectedValue={(field?.value?.value ?? '') + ''}
          displayValue={field?.value?.label ?? ''}
          selectPlaceholder={field?.value?.value ?? createAgent}
          iconSide="right"
          searchPlaceholder={localize('com_agents_search_name')}
          SelectIcon={field?.value?.icon}
          setValue={onSelect}
          items={
            agents?.map((agent) => ({
              label: agent.name ?? '',
              value: agent.id ?? '',
              icon: agent.icon,
            })) ?? [
              {
                label: 'Loading...',
                value: '',
              },
            ]
          }
          className={cn(
            'z-50 flex h-[40px] w-full flex-none items-center justify-center truncate rounded-md bg-transparent font-bold',
          )}
          ariaLabel={localize('com_ui_agent')}
          isCollapsed={false}
          showCarat={true}
        />
      )}
    />
  );
}
