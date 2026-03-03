import { useState, useCallback } from 'react';
import { ChevronDown, FolderIcon, PlusIcon } from 'lucide-react';
import { useRecoilState } from 'recoil';
import { Button, useToastContext } from '@librechat/client';
import type { TUserProject } from 'librechat-data-provider';
import {
  useUserProjectsQuery,
  useCreateUserProjectMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import store from '~/store';
import { cn } from '~/utils';
import CreateProjectModal from './CreateProjectModal';

export default function ProjectNav() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [selectedProjectId, setSelectedProjectId] = useRecoilState(
    store.selectedProjectIdAtom,
  );
  const [isExpanded, setIsExpanded] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const { data, isLoading } = useUserProjectsQuery({ limit: 50 });
  const createMutation = useCreateUserProjectMutation({
    onSuccess: () => {
      setIsCreateModalOpen(false);
      showToast({ message: localize('com_ui_project_created') });
    },
    onError: (error: unknown) => {
      showToast({
        message: error instanceof Error ? error.message : localize('com_ui_error'),
        status: 'error',
      });
    },
  });

  const projects = data?.projects ?? [];

  const handleSelectProject = useCallback((id: string | null) => {
    setSelectedProjectId(id);
  }, [setSelectedProjectId]);

  const handleCreateProject = useCallback(
    (name: string) => {
      createMutation.mutate({ name });
    },
    [createMutation],
  );

  return (
    <div className="mb-1">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="group flex w-full items-center justify-between rounded-lg px-1 py-2 text-xs font-bold text-text-secondary outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
        type="button"
      >
        <span className="select-none">{localize('com_ui_projects')}</span>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-6 rounded p-0 opacity-0 group-hover:opacity-100"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              e.preventDefault();
              setIsCreateModalOpen(true);
            }}
            aria-label={localize('com_ui_new_project')}
          >
            <PlusIcon className="size-3.5" />
          </Button>
          <ChevronDown
            className={cn('h-3 w-3 transition-transform duration-200', isExpanded ? 'rotate-180' : '')}
          />
        </div>
      </button>

      {isExpanded && (
        <div className="max-h-32 overflow-y-auto">
          <button
            onClick={() => handleSelectProject(null)}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm',
              !selectedProjectId
                ? 'bg-surface-hover text-text-primary'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
            )}
          >
            <FolderIcon className="size-3.5 shrink-0 opacity-60" />
            <span className="truncate">{localize('com_ui_all_projects')}</span>
          </button>
          {isLoading ? (
            <div className="px-2 py-1.5 text-xs text-text-secondary">
              {localize('com_ui_loading')}
            </div>
          ) : (
            projects.map((project: TUserProject) => (
              <button
                key={project._id}
                onClick={() => handleSelectProject(project._id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm',
                  selectedProjectId === project._id
                    ? 'bg-surface-hover text-text-primary'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                )}
              >
                <FolderIcon className="size-3.5 shrink-0 opacity-60" />
                <span className="truncate">{project.name}</span>
              </button>
            ))
          )}
        </div>
      )}

      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateProject}
        isLoading={createMutation.isLoading}
      />
    </div>
  );
}
