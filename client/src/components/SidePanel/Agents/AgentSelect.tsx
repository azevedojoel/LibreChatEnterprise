import { EarthIcon } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import {
  AgentCapabilities,
  Tools,
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
  syncOnly = false,
}: {
  selectedAgentId: string | null;
  agentQuery: QueryObserverResult<Agent>;
  setCurrentAgentId: React.Dispatch<React.SetStateAction<string | undefined>>;
  createMutation: UseMutationResult<Agent, Error, AgentCreateParams>;
  /** When true, only syncs form from agentQuery (no dropdown UI). Used by page variant. */
  syncOnly?: boolean;
}) {
  const localize = useLocalize();
  const { reset } = useFormContext();
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
      const providerValue =
        typeof fullAgent.provider === 'string'
          ? fullAgent.provider
          : (fullAgent.provider as { value?: string })?.value ?? '';
      const update = {
        ...fullAgent,
        provider: createProviderOption(providerValue),
        label: fullAgent.name ?? '',
        value: fullAgent.id || '',
        icon: isGlobal ? <EarthIcon className={'icon-lg text-green-400'} /> : null,
      };

      const capabilities: TAgentCapabilities = {
        [AgentCapabilities.web_search]: false,
        [AgentCapabilities.file_search]: false,
        [AgentCapabilities.execute_code]: false,
        [AgentCapabilities.create_pdf]: false,
        [AgentCapabilities.manage_scheduling]: false,
        [AgentCapabilities.sys_admin]: false,
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
          tool === Tools.workspace_glob_files ||
          tool === Tools.workspace_send_file_to_user ||
          tool === Tools.workspace_pull_file ||
          tool === Tools.generate_code ||
          tool === Tools.install_dependencies ||
          tool === Tools.lint ||
          tool === Tools.run_program ||
          tool === Tools.workspace_status ||
          tool === Tools.workspace_init ||
          tool === Tools.reset_workspace ||
          tool === Tools.update_todo ||
          tool === Tools.create_plan
        ) {
          capabilities[AgentCapabilities.execute_code] = true;
          return;
        }
        if (schedulingToolSet.has(tool as Tools)) {
          capabilities[AgentCapabilities.manage_scheduling] = true;
          if (!agentTools.includes(AgentCapabilities.manage_scheduling)) {
            agentTools.push(AgentCapabilities.manage_scheduling);
          }
          return;
        }
        if (typeof tool === 'string' && tool.startsWith('sys_admin_')) {
          capabilities[AgentCapabilities.sys_admin] = true;
          if (!agentTools.includes(AgentCapabilities.sys_admin)) {
            agentTools.push(AgentCapabilities.sys_admin);
          }
          return;
        }
        if (tool === Tools.create_pdf) {
          capabilities[AgentCapabilities.create_pdf] = true;
          return;
        }
        agentTools.push(tool);
      });

      const formValues: Partial<AgentForm & TAgentCapabilities> = {
        ...capabilities,
        id: fullAgent.id || '',
        name: fullAgent.name ?? '',
        description: fullAgent.description ?? '',
        instructions: fullAgent.instructions ?? '',
        agent: update,
        model: update.model ?? '',
        tools: agentTools,
        category: fullAgent.category || 'general',
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
        if (name === 'tool_options' && typeof value === 'object' && value !== null) {
          formValues[name] = value;
          return;
        }
        if (!keys.has(name)) return;
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

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedId = e.target.value;
      createMutation.reset();

      if (!selectedId) {
        setCurrentAgentId(undefined);
        return reset(getDefaultAgentFormValues());
      }

      const agentMatch = (a: { id?: string; value?: string | number | null }) =>
        String(a.id ?? a.value ?? '') === selectedId;
      const agentExists = (agents ?? []).some(agentMatch);

      if (!agentExists) {
        setCurrentAgentId(undefined);
        return reset(getDefaultAgentFormValues());
      }

      setCurrentAgentId(selectedId);

      const agent = agentQuery.data;
      if (agent?.id === selectedId) {
        resetAgentForm(agent);
        return;
      }

      const selectedAgent = (agents ?? []).find(agentMatch);
      if (selectedAgent) {
        const agentForForm: Agent = {
          ...selectedAgent,
          id: String(selectedAgent.id ?? selectedAgent.value ?? selectedId),
        };
        resetAgentForm(agentForForm);
      }
    },
    [agents, createMutation, setCurrentAgentId, agentQuery.data, resetAgentForm, reset],
  );

  useEffect(() => {
    const agentId = agentQuery.data?.id ?? agentQuery.data?._id;
    if (
      agentQuery.data &&
      agentQuery.isSuccess &&
      agentId != null &&
      String(agentId) === selectedAgentId
    ) {
      resetAgentForm(agentQuery.data);
    }
  }, [agentQuery.data, agentQuery.isSuccess, selectedAgentId, resetAgentForm]);

  if (syncOnly) {
    return null;
  }

  const createAgent = localize('com_ui_create_new_agent');
  const currentValue = selectedAgentId ?? '';

  return (
    <select
      value={currentValue}
      onChange={handleChange}
      aria-label={localize('com_ui_agent')}
      className={cn(
        'flex h-10 w-full flex-none cursor-pointer items-center justify-center truncate rounded-md border border-border-light bg-surface-secondary px-3 py-2 text-sm font-bold text-text-primary',
        'focus:outline-none focus:ring-2 focus:ring-ring-primary',
      )}
    >
      <option value="">{createAgent}</option>
      {(agents ?? []).map((agent) => {
        const id = String(agent.id ?? agent.value ?? '');
        return (
          <option key={id} value={id}>
            {agent.name ?? agent.label ?? id}
          </option>
        );
      })}
    </select>
  );
}
