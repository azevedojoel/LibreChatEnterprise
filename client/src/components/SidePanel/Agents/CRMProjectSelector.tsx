import React, { useState, useMemo, useCallback, useRef } from 'react';
import { X, Folder } from 'lucide-react';
import {
  HoverCard,
  CircleHelpIcon,
  HoverCardPortal,
  ControlCombobox,
  HoverCardContent,
  HoverCardTrigger,
  Input,
  Button,
  useToastContext,
} from '@librechat/client';
import type { ControllerRenderProps } from 'react-hook-form';
import type { AgentForm, OptionWithIcon } from '~/common';
import {
  useGetStartupConfig,
  useCreateProjectMutation,
  useListProjectsQuery,
} from '~/data-provider';
import { dataService } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { ESide } from '~/common';
import { removeFocusOutlines, defaultTextProps } from '~/utils';
import { cn } from '~/utils';

interface CRMProjectSelectorProps {
  field: ControllerRenderProps<AgentForm, 'projectIds'>;
}

const inputClass = cn(
  defaultTextProps,
  'flex w-full px-3 py-2 border-border-light bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring-primary',
  removeFocusOutlines,
);

const CRMProjectSelector: React.FC<CRMProjectSelectorProps> = ({ field }) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [newProjectId, setNewProjectId] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [createdProjectNames, setCreatedProjectNames] = useState<Record<string, string>>({});
  const { data: startupConfig } = useGetStartupConfig();
  const { data: projects = [] } = useListProjectsQuery();
  const instanceProjectId = startupConfig?.instanceProjectId;
  const value = field.value ?? [];
  const valueRef = useRef(value);
  valueRef.current = value;

  const createProject = useCreateProjectMutation({
    onSuccess: (data) => {
      field.onChange([...valueRef.current, data._id]);
      setCreatedProjectNames((prev) => ({ ...prev, [data._id]: data.name }));
      setNewProjectName('');
      showToast({ message: localize('com_agents_crm_project_create_success') });
    },
    onError: (err) => {
      const message =
        err.message?.includes('reserved') ? localize('com_agents_crm_project_name_reserved') : err.message;
      showToast({ message: message ?? localize('com_ui_error'), status: 'error' });
    },
  });

  const projectNamesMap = useMemo(() => {
    const map: Record<string, string> = { ...createdProjectNames };
    projects.forEach((p) => {
      map[p._id] =
        p._id === instanceProjectId ? localize('com_agents_crm_project_instance') : p.name;
    });
    return map;
  }, [projects, instanceProjectId, localize, createdProjectNames]);

  const projectOptions = useMemo(() => {
    return projects.map((p) => ({
      label: projectNamesMap[p._id] ?? p.name,
      value: p._id,
      icon: <Folder size={16} className="text-text-secondary" />,
    })) as OptionWithIcon[];
  }, [projects, projectNamesMap]);

  const selectableProjects = useMemo(
    () => projectOptions.filter((p) => !value.includes(p.value)),
    [projectOptions, value],
  );

  const getProjectLabel = useCallback(
    (id: string) => projectNamesMap[id] ?? id,
    [projectNamesMap],
  );

  const handleCreateProject = useCallback(() => {
    const trimmed = newProjectName.trim();
    if (!trimmed) return;
    if (trimmed.toLowerCase() === 'instance') {
      showToast({ message: localize('com_agents_crm_project_name_reserved'), status: 'error' });
      return;
    }
    createProject.mutate({ name: trimmed });
  }, [newProjectName, createProject, localize, showToast]);

  const removeAt = useCallback(
    (index: number) => {
      field.onChange(value.filter((_, i) => i !== index));
    },
    [value, field],
  );

  React.useEffect(() => {
    if (newProjectId && !value.includes(newProjectId)) {
      field.onChange([...value, newProjectId]);
      setNewProjectId('');
    }
  }, [newProjectId, value, field]);

  React.useEffect(() => {
    const unknownIds = value.filter((id) => !projectNamesMap[id]);
    if (unknownIds.length === 0) return;
    let cancelled = false;
    void Promise.all(
      unknownIds.map((id) =>
        dataService
          .getProject(id)
          .then((p) => ({ id: p._id, name: p.name }))
          .catch(() => null),
      ),
    ).then((results) => {
      if (cancelled) return;
      setCreatedProjectNames((prev) => {
        const next = { ...prev };
        results.forEach((r) => {
          if (r) next[r.id] = r.name;
        });
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [value, projectNamesMap]);

  return (
    <HoverCard openDelay={50}>
      <div className="my-2 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <label className="font-semibold text-text-primary">
            {localize('com_agents_crm_project')}
          </label>
          <HoverCardTrigger asChild>
            <button
              type="button"
              className="inline-flex"
              aria-label={localize('com_agents_crm_project_info')}
            >
              <CircleHelpIcon className="h-4 w-4 text-text-tertiary" />
            </button>
          </HoverCardTrigger>
        </div>
        <div className="space-y-1">
          {value.map((projectId, idx) => (
            <div
              key={projectId}
              className="flex h-10 items-center gap-2 rounded-md border border-border-medium bg-surface-tertiary pr-2"
            >
              <Folder size={16} className="text-text-secondary" />
              <span className="flex-1 truncate text-sm text-text-primary">
                {getProjectLabel(projectId)}
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
            ariaLabel={localize('com_agents_crm_project_placeholder')}
            selectedValue=""
            setValue={setNewProjectId}
            selectPlaceholder={localize('com_agents_crm_project_placeholder')}
            searchPlaceholder={localize('com_ui_agent_var', { 0: localize('com_ui_search') })}
            items={selectableProjects}
            className="h-10 w-full border-dashed border-border-heavy text-center text-text-secondary hover:text-text-primary"
            containerClassName="px-0"
            SelectIcon={<Folder size={16} className="text-text-secondary" />}
          />
          <div className="mt-2 flex gap-2">
            <Input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder={localize('com_agents_crm_project_name_placeholder')}
              className={inputClass}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
            />
            <Button
              type="button"
              onClick={handleCreateProject}
              disabled={!newProjectName.trim() || createProject.isPending}
              className="shrink-0"
            >
              {localize('com_agents_crm_project_create')}
            </Button>
          </div>
        </div>
      </div>
      <HoverCardPortal>
        <HoverCardContent side={ESide.Top} className="w-80">
          <div className="space-y-2">
            <p className="text-sm text-text-secondary">
              {localize('com_agents_crm_project_info')}
            </p>
          </div>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
};

export default CRMProjectSelector;
