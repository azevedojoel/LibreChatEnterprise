import React from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronRight, FolderIcon, Check, Share2 } from 'lucide-react';
import { Constants } from 'librechat-data-provider';
import type { TUserProject } from 'librechat-data-provider';
import { useUserProjectsQuery, useUpdateConversationMutation } from '~/data-provider';
import { useChatContext } from '~/Providers';
import { useBadgeRowContext } from '~/Providers';
import { useToastContext } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const AddToProjectSubMenu = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => {
    const localize = useLocalize();
    const { showToast } = useToastContext();
    const { conversation, setConversation } = useChatContext();
    const { conversationId } = useBadgeRowContext();

    const currentProjectId =
      (conversation?.userProjectId as string) ?? conversation?.userProjectId ?? null;
    const isNewConvo = !conversationId || conversationId === Constants.NEW_CONVO;

    const { data, isLoading } = useUserProjectsQuery({ limit: 50 });
    const updateMutation = useUpdateConversationMutation(conversationId ?? '');

    const projects = data?.projects ?? [];
    const currentProject = projects.find((p: TUserProject) => p._id === currentProjectId);

    const menuStore = Ariakit.useMenuStore({
      focusLoop: true,
      showTimeout: 100,
      placement: 'right',
    });

    const handleSelectProject = (projectId: string | null) => {
      if (isNewConvo || !conversationId) {
        setConversation?.((prev) => {
          const base = prev ?? conversation;
          if (!base) return prev;
          return { ...base, userProjectId: projectId };
        });
        showToast({
          message: localize('com_ui_project_selected_for_new_chat'),
          status: 'success',
        });
        menuStore.hide();
        return;
      }
      updateMutation.mutate(
        { conversationId: conversationId as string, userProjectId: projectId },
        {
          onSuccess: (updatedConvo) => {
            if (updatedConvo && setConversation) {
              setConversation(updatedConvo);
            }
            showToast({
              message: projectId
                ? localize('com_ui_added_to_project')
                : localize('com_ui_removed_from_project'),
              status: 'success',
            });
            menuStore.hide();
          },
          onError: (err: unknown) => {
            showToast({
              message: err instanceof Error ? err.message : localize('com_ui_error'),
              status: 'error',
            });
          },
        },
      );
    };

    return (
      <div ref={ref}>
        <Ariakit.MenuProvider store={menuStore}>
          <Ariakit.MenuItem
            {...props}
            hideOnClick={false}
            render={
              <Ariakit.MenuButton
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  menuStore.toggle();
                }}
                className="flex w-full cursor-pointer items-center justify-between rounded-lg p-2 hover:bg-surface-hover"
              />
            }
          >
            <div className="flex items-center gap-2">
              <FolderIcon className="h-5 w-5 flex-shrink-0 text-text-primary" aria-hidden="true" />
              <span>
                {currentProject ? currentProject.name : localize('com_ui_add_to_project')}
              </span>
              <ChevronRight className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            </div>
          </Ariakit.MenuItem>

          <Ariakit.Menu
            portal={true}
            unmountOnHide={true}
            aria-label={localize('com_ui_projects')}
            className={cn(
              'animate-popover-left z-40 ml-3 flex min-w-[200px] max-w-[280px] flex-col rounded-xl',
              'border border-border-medium bg-surface-primary text-text-primary p-1.5 shadow-lg',
            )}
          >
            <div className="flex max-h-[280px] flex-col gap-0.5 overflow-y-auto">
              <button
                type="button"
                onClick={() => handleSelectProject(null)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover',
                  !currentProjectId && 'bg-surface-hover',
                )}
              >
                {!currentProjectId && <Check className="h-4 w-4 shrink-0 text-text-primary" />}
                <span className={!currentProjectId ? 'ml-2' : 'ml-6'}>
                  {localize('com_ui_no_project')}
                </span>
              </button>
              {isLoading ? (
                <div className="px-2 py-2 text-xs text-text-secondary">
                  {localize('com_ui_loading')}
                </div>
              ) : (
                projects.map((project: TUserProject) => (
                  <button
                    key={project._id}
                    type="button"
                    onClick={() => handleSelectProject(project._id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover',
                      currentProjectId === project._id && 'bg-surface-hover',
                    )}
                  >
                    {currentProjectId === project._id ? (
                      <Check className="h-4 w-4 shrink-0 text-text-primary" />
                    ) : (
                      <FolderIcon className="h-4 w-4 shrink-0 text-text-secondary" />
                    )}
                    <span className={cn('flex-1 truncate', currentProjectId === project._id ? 'ml-2' : 'ml-6')}>
                      {project.name}
                    </span>
                    {project.shared && (
                      <Share2 className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
                    )}
                  </button>
                ))
              )}
            </div>
          </Ariakit.Menu>
        </Ariakit.MenuProvider>
      </div>
    );
  },
);

AddToProjectSubMenu.displayName = 'AddToProjectSubMenu';

export default React.memo(AddToProjectSubMenu);
