import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { useForm, Controller } from 'react-hook-form';
import { Input, Label, Button, useToastContext } from '@librechat/client';
import { Folder } from 'lucide-react';
import { useMCPAuthValuesQuery } from '~/data-provider/Tools/queries';
import {
  useGetStartupConfig,
  useCreateProjectMutation,
  useListProjectsQuery,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import { ControlCombobox } from '@librechat/client';
import type { OptionWithIcon } from '~/common';

export interface CustomUserVarConfig {
  title: string;
  description?: string;
}

interface CustomUserVarsSectionProps {
  serverName: string;
  fields: Record<string, CustomUserVarConfig>;
  onSave: (authData: Record<string, string>) => void;
  onRevoke: () => void;
  isSubmitting?: boolean;
}
interface AuthFieldProps {
  name: string;
  config: CustomUserVarConfig;
  hasValue: boolean;
  control: any;
  errors: any;
  autoFocus?: boolean;
}

interface MCPProjectSelectorFieldProps {
  name: string;
  config: CustomUserVarConfig;
  hasValue: boolean;
  control: any;
  errors: any;
  setValue: (name: string, value: string) => void;
  onSave: (authData: Record<string, string>) => void;
  localize: (key: string, vars?: Record<string, string>) => string;
}

function MCPProjectSelectorField({
  name,
  config,
  hasValue,
  control,
  errors,
  setValue,
  onSave,
  localize,
}: MCPProjectSelectorFieldProps) {
  const { showToast } = useToastContext();
  const [newProjectName, setNewProjectName] = React.useState('');
  const { data: startupConfig } = useGetStartupConfig();
  const { data: projects = [] } = useListProjectsQuery();
  const instanceProjectId = startupConfig?.instanceProjectId;

  const createProject = useCreateProjectMutation({
    onSuccess: (data) => {
      setValue(name, data._id);
      onSave({ [name]: data._id });
      setNewProjectName('');
      showToast({ message: localize('com_agents_crm_project_create_success') });
    },
    onError: (err) => {
      const message =
        err?.message?.includes('reserved') ? localize('com_agents_crm_project_name_reserved') : err?.message;
      showToast({ message: message ?? localize('com_ui_error'), status: 'error' });
    },
  });

  const projectOptions = useMemo(() => {
    return projects.map((p) => ({
      label: p._id === instanceProjectId ? localize('com_agents_crm_project_instance') : p.name,
      value: p._id,
      icon: <Folder size={16} className="text-text-secondary" />,
    })) as OptionWithIcon[];
  }, [projects, instanceProjectId, localize]);

  const handleCreateProject = () => {
    const trimmed = newProjectName.trim();
    if (!trimmed) return;
    if (trimmed.toLowerCase() === 'instance') {
      showToast({ message: localize('com_agents_crm_project_name_reserved'), status: 'error' });
      return;
    }
    createProject.mutate({ name: trimmed });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={name} className="text-sm font-medium">
          {config.title} <span className="sr-only">({hasValue ? localize('com_ui_set') : localize('com_ui_unset')})</span>
        </Label>
        {hasValue && (
          <div className="flex min-w-fit items-center gap-2 whitespace-nowrap rounded-full border border-border-light px-2 py-0.5 text-xs font-medium text-text-secondary">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
            <span>{localize('com_ui_set')}</span>
          </div>
        )}
      </div>
      <Controller
        name={name}
        control={control}
        defaultValue=""
        render={({ field }) => (
          <div className="space-y-2">
            <ControlCombobox
              isCollapsed={false}
              ariaLabel={localize('com_agents_crm_project_placeholder')}
              selectedValue={field.value}
              setValue={field.onChange}
              selectPlaceholder={localize('com_agents_crm_project_placeholder')}
              searchPlaceholder={localize('com_ui_agent_var', { 0: localize('com_ui_search') })}
              items={projectOptions}
              className="h-10 w-full rounded border border-border-medium bg-transparent px-2 py-1 text-text-primary"
              containerClassName="px-0"
              SelectIcon={<Folder size={16} className="text-text-secondary" />}
            />
            <div className="flex gap-2">
              <Input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder={localize('com_agents_crm_project_name_placeholder')}
                className="flex-1 rounded border border-border-medium bg-transparent px-2 py-1 text-sm text-text-primary"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleCreateProject())}
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
        )}
      />
      {config.description && (
        <p className="text-xs text-text-secondary">{config.description}</p>
      )}
      {errors[name] && <p className="text-xs text-red-500">{errors[name]?.message}</p>}
    </div>
  );
}

function AuthField({ name, config, hasValue, control, errors, autoFocus }: AuthFieldProps) {
  const localize = useLocalize();
  const statusText = hasValue ? localize('com_ui_set') : localize('com_ui_unset');

  const sanitizer = useMemo(() => {
    const instance = DOMPurify();
    instance.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName && node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
    return instance;
  }, []);

  const sanitizedDescription = useMemo(() => {
    if (!config.description) {
      return '';
    }
    try {
      return sanitizer.sanitize(config.description, {
        ALLOWED_TAGS: ['a', 'strong', 'b', 'em', 'i', 'br', 'code'],
        ALLOWED_ATTR: ['href', 'class', 'target', 'rel'],
        ALLOW_DATA_ATTR: false,
        ALLOW_ARIA_ATTR: false,
      });
    } catch (error) {
      console.error('Sanitization failed', error);
      return config.description;
    }
  }, [config.description, sanitizer]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={name} className="text-sm font-medium">
          {config.title} <span className="sr-only">({statusText})</span>
        </Label>
        <div aria-hidden="true">
          {hasValue ? (
            <div className="flex min-w-fit items-center gap-2 whitespace-nowrap rounded-full border border-border-light px-2 py-0.5 text-xs font-medium text-text-secondary">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <span>{localize('com_ui_set')}</span>
            </div>
          ) : (
            <div className="flex min-w-fit items-center gap-2 whitespace-nowrap rounded-full border border-border-light px-2 py-0.5 text-xs font-medium text-text-secondary">
              <div className="h-1.5 w-1.5 rounded-full border border-border-medium" />
              <span>{localize('com_ui_unset')}</span>
            </div>
          )}
        </div>
      </div>
      <Controller
        name={name}
        control={control}
        defaultValue=""
        render={({ field }) => (
          <Input
            id={name}
            type="text"
            /* autoFocus is generally disabled due to the fact that it can disorient users,
             * but in this case, the required field would logically be immediately navigated to anyways, and the component's
             * functionality emulates that of a new modal opening, where users would expect focus to be shifted to the new content */
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus={autoFocus}
            {...field}
            placeholder={
              hasValue
                ? localize('com_ui_mcp_update_var', { 0: config.title })
                : localize('com_ui_mcp_enter_var', { 0: config.title })
            }
            className="w-full rounded border border-border-medium bg-transparent px-2 py-1 text-text-primary placeholder:text-text-secondary focus:outline-none sm:text-sm"
          />
        )}
      />
      {sanitizedDescription && (
        <p
          className="text-xs text-text-secondary [&_a]:text-blue-500 [&_a]:hover:underline"
          dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
        />
      )}
      {errors[name] && <p className="text-xs text-red-500">{errors[name]?.message}</p>}
    </div>
  );
}

export default function CustomUserVarsSection({
  fields,
  onSave,
  onRevoke,
  serverName,
  isSubmitting = false,
}: CustomUserVarsSectionProps) {
  const localize = useLocalize();

  const { data: authValuesData } = useMCPAuthValuesQuery(serverName, {
    enabled: !!serverName,
  });

  const {
    reset,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<Record<string, string>>({
    defaultValues: useMemo(() => {
      const initial: Record<string, string> = {};
      Object.keys(fields).forEach((key) => {
        initial[key] = '';
      });
      return initial;
    }, [fields]),
  });

  const onFormSubmit = (data: Record<string, string>) => {
    onSave(data);
  };

  const handleRevokeClick = () => {
    onRevoke();
    reset();
  };

  if (!fields || Object.keys(fields).length === 0) {
    return null;
  }

  return (
    <div className="flex-1 space-y-4">
      <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
        {Object.entries(fields).map(([key, config], index) => {
          const hasValue = authValuesData?.authValueFlags?.[key] || false;
          const isCRMProjectId = serverName === 'CRM' && key === 'PROJECT_ID';

          if (isCRMProjectId) {
            return (
              <div key={key} className="space-y-2">
                <Label className="text-sm font-medium">{config.title}</Label>
                <p className="text-xs text-text-secondary">
                  {localize('com_ui_user_crm_project_info')}
                </p>
              </div>
            );
          }

          return (
            <AuthField
              key={key}
              name={key}
              config={config}
              hasValue={hasValue}
              control={control}
              errors={errors}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- See AuthField autoFocus comment for more details
              autoFocus={index === 0}
            />
          );
        })}
      </form>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="destructive"
          disabled={isSubmitting}
          onClick={handleRevokeClick}
        >
          {localize('com_ui_revoke')}
        </Button>
        <Button
          type="button"
          variant="submit"
          disabled={isSubmitting}
          onClick={handleSubmit(onFormSubmit)}
        >
          {isSubmitting ? localize('com_ui_saving') : localize('com_ui_save')}
        </Button>
      </div>
    </div>
  );
}
