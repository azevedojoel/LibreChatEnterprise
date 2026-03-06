import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, FolderIcon, Mail, PlusIcon, Search, Share2, Trash2, X } from 'lucide-react';
import { useRecoilState } from 'recoil';
import { Button, CircleHelpIcon, OGDialog, OGDialogTemplate, TooltipAnchor, useToastContext } from '@librechat/client';
import type { TUserProject } from 'librechat-data-provider';
import {
  useUserProjectsQuery,
  useDeleteUserProjectMutation,
  useGetWorkspaceMeQuery,
} from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import store from '~/store';
import { cn, clearMessagesCache } from '~/utils';

const PROJECTS_HELP_HINT_ID = 'projectsHelp';
const CREATE_PROJECT_PROMPT = 'Hey Ellis, I want to create a new project for ';

function DeleteProjectDialog({
  project,
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: {
  project: TUserProject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading: boolean;
}) {
  const localize = useLocalize();

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogTemplate
        title={localize('com_ui_delete_project')}
        showCloseButton
        className="max-w-md"
        main={
          <p className="text-text-secondary">
            {localize('com_ui_delete_project_confirm').replace('{{name}}', project.name)}
          </p>
        }
        buttons={
          <Button variant="destructive" onClick={onConfirm} disabled={isLoading}>
            {localize('com_ui_delete')}
          </Button>
        }
      />
    </OGDialog>
  );
}

export default function ProjectNav() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  const { showToast } = useToastContext();
  const { conversation } = store.useCreateConversationAtom(0);
  const [selectedProjectId, setSelectedProjectId] = useRecoilState(
    store.selectedProjectIdAtom,
  );
  const [isExpanded, setIsExpanded] = useRecoilState(store.projectsNavExpandedAtom);
  const [dismissedHelpHints, setDismissedHelpHints] = useRecoilState(
    store.dismissedHelpHintsAtom,
  );
  const [projectFilter, setProjectFilter] = useState('');
  const [projectToDelete, setProjectToDelete] = useState<TUserProject | null>(null);

  const { data, isLoading } = useUserProjectsQuery({ limit: 50 });
  const { data: workspaceMeData } = useGetWorkspaceMeQuery();
  const deleteMutation = useDeleteUserProjectMutation({
    onSuccess: (_data, id) => {
      setProjectToDelete(null);
      if (selectedProjectId === id) {
        setSelectedProjectId(null);
      }
      showToast({ message: localize('com_ui_project_deleted') });
    },
    onError: (error: unknown) => {
      showToast({
        message: error instanceof Error ? error.message : localize('com_ui_error'),
        status: 'error',
      });
    },
  });

  const projects = data?.projects ?? [];

  const filterLower = projectFilter.trim().toLowerCase();
  const matchesFilter = useCallback(
    (p: TUserProject) => !filterLower || p.name.toLowerCase().includes(filterLower),
    [filterLower],
  );

  const { personal, workspace: workspaceProjects } = useMemo(() => {
    const personalList = projects.filter((p) => !p.shared && matchesFilter(p));
    const workspaceList = projects.filter((p) => p.shared && matchesFilter(p));
    return { personal: personalList, workspace: workspaceList };
  }, [projects, matchesFilter]);

  const selectedProject = useMemo(
    () => projects.find((p) => p._id === selectedProjectId),
    [projects, selectedProjectId],
  );

  const handleSelectProject = useCallback((id: string | null) => {
    setSelectedProjectId(id);
  }, [setSelectedProjectId]);

  const handleCreateProjectPrompt = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const prompt = encodeURIComponent(CREATE_PROJECT_PROMPT);
      navigate(`/c/new?prompt=${prompt}`, { state: { focusChat: true } });
    },
    [navigate],
  );

  const handleConfirmDelete = useCallback(() => {
    if (projectToDelete) {
      deleteMutation.mutate(projectToDelete._id);
    }
  }, [projectToDelete, deleteMutation]);

  const handleProjectsHelp = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!dismissedHelpHints.includes(PROJECTS_HELP_HINT_ID)) {
        setDismissedHelpHints([...dismissedHelpHints, PROJECTS_HELP_HINT_ID]);
      }
      clearMessagesCache(queryClient, conversation?.conversationId);
      queryClient.invalidateQueries([QueryKeys.messages]);
      navigate('/c/new?autoStarter=projects', { state: { focusChat: true } });
    },
    [
      dismissedHelpHints,
      setDismissedHelpHints,
      queryClient,
      conversation?.conversationId,
      navigate,
    ],
  );

  return (
    <div className="mb-1">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="group flex w-full items-center justify-between rounded-lg px-1 py-2 text-sm font-bold text-text-secondary outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
        type="button"
      >
        <div className="flex min-w-0 flex-1 items-center gap-0.5">
          <span className="shrink-0 select-none">{localize('com_ui_projects')}</span>
          <TooltipAnchor
            description={localize('com_ui_projects_help')}
            side="top"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleProjectsHelp(e);
            }}
            render={
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className={cn(
                  'size-6 shrink-0 rounded p-0',
                  dismissedHelpHints.includes(PROJECTS_HELP_HINT_ID)
                    ? 'opacity-0 group-hover:opacity-100'
                    : 'opacity-100',
                )}
                aria-label={localize('com_ui_projects_help')}
              >
                <CircleHelpIcon className="size-3.5" />
              </Button>
            }
          />
          {selectedProject && (
            <span
              className="max-w-20 shrink truncate rounded-full bg-surface-hover px-1.5 py-0.5 text-[11px] font-medium text-text-primary"
              title={selectedProject.name}
            >
              {selectedProject.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-6 rounded p-0 opacity-0 group-hover:opacity-100"
            onClick={handleCreateProjectPrompt}
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
        <div className="flex flex-col gap-1">
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
          <div className="group relative flex h-8 min-h-8 cursor-pointer items-center gap-3 rounded-lg border-2 border-transparent px-2 py-1.5 text-text-primary focus-within:border-ring-primary focus-within:bg-surface-active-alt hover:bg-surface-active-alt">
            <Search
              aria-hidden
              className="h-3.5 w-3.5 shrink-0 text-text-secondary group-focus-within:text-text-primary group-hover:text-text-primary"
            />
            <input
              type="text"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.code === 'Space') {
                  e.stopPropagation();
                }
              }}
              className="m-0 w-full border-none bg-transparent p-0 pl-1 text-sm leading-tight placeholder-text-secondary placeholder-opacity-100 focus-visible:outline-none"
              placeholder={localize('com_ui_filter_projects')}
              aria-label={localize('com_ui_filter_projects')}
              autoComplete="off"
            />
            {projectFilter.trim() && (
              <button
                type="button"
                onClick={() => setProjectFilter('')}
                aria-label={localize('com_ui_clear_search')}
                className="flex size-6 shrink-0 items-center justify-center rounded-full p-0 text-text-secondary transition-colors hover:text-text-primary"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
          <div className="max-h-56 overflow-y-auto">
            {isLoading ? (
              <div className="px-2 py-1.5 text-xs text-text-secondary">
                {localize('com_ui_loading')}
              </div>
            ) : (
              <>
                {personal.length > 0 && (
                  <div className="mt-0.5">
                    {workspaceProjects.length > 0 && (
                      <div className="px-2 py-0.5 text-xs font-medium text-text-secondary">
                        {localize('com_ui_my_projects')}
                      </div>
                    )}
                    {personal.map((project: TUserProject) => {
                      const canDelete = project.owner === user?.id && !project.isInbound;
                      return (
                        <div
                          key={project._id}
                          className="group flex w-full items-center gap-0.5"
                        >
                          <button
                            onClick={() => handleSelectProject(project._id)}
                            className={cn(
                              'flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm',
                              selectedProjectId === project._id
                                ? 'bg-surface-hover text-text-primary'
                                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                            )}
                          >
                            <FolderIcon className="size-3.5 shrink-0 opacity-60" />
                            <span className="truncate flex-1">{project.name}</span>
                          </button>
                          {canDelete && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-6 shrink-0 rounded p-0 opacity-0 group-hover:opacity-100 text-text-secondary hover:text-red-500"
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setProjectToDelete(project);
                              }}
                              aria-label={localize('com_ui_delete_project')}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {workspaceProjects.length > 0 && (
                  <div className={cn('mt-1.5 pt-1.5', personal.length > 0 && 'border-t border-surface-secondary')}>
                    <div className="px-2 py-0.5 text-xs font-medium text-text-secondary">
                      {localize('com_ui_workspace_projects')}
                    </div>
                    {workspaceProjects.map((project: TUserProject) => {
                      const canDelete = !!workspaceMeData?.isAdmin && !project.isInbound;
                      return (
                        <div
                          key={project._id}
                          className="group flex w-full items-center gap-0.5"
                        >
                          <button
                            onClick={() => handleSelectProject(project._id)}
                            className={cn(
                              'flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm',
                              selectedProjectId === project._id
                                ? 'bg-surface-hover text-text-primary'
                                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                            )}
                          >
                            {project.isInbound ? (
                              <Mail className="size-3.5 shrink-0 opacity-60" />
                            ) : (
                              <FolderIcon className="size-3.5 shrink-0 opacity-60" />
                            )}
                            <span className="truncate flex-1">{project.name}</span>
                            {project.isInbound && (
                              <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-surface-secondary text-text-secondary">
                                Inbound
                              </span>
                            )}
                            <Share2 className="size-3.5 shrink-0 opacity-60 text-text-secondary" aria-hidden />
                          </button>
                          {canDelete && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-6 shrink-0 rounded p-0 opacity-0 group-hover:opacity-100 text-text-secondary hover:text-red-500"
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setProjectToDelete(project);
                              }}
                              aria-label={localize('com_ui_delete_project')}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {personal.length === 0 && workspaceProjects.length === 0 && !isLoading && (
                  <div className="px-2 py-1.5 text-xs text-text-secondary">
                    {localize('com_ui_no_project')}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {projectToDelete && (
        <DeleteProjectDialog
          project={projectToDelete}
          open={!!projectToDelete}
          onOpenChange={(open) => !open && setProjectToDelete(null)}
          onConfirm={handleConfirmDelete}
          isLoading={deleteMutation.isLoading}
        />
      )}
    </div>
  );
}
