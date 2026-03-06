import React, { useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { FolderIcon, Check, Share2 } from 'lucide-react';
import { Constants } from 'librechat-data-provider';
import type { TUserProject } from 'librechat-data-provider';
import { useUserProjectsQuery, useUpdateConversationMutation } from '~/data-provider';
import { useChatContext, useBadgeRowContext } from '~/Providers';
import { useToastContext, TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function ProjectIndicator() {
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

  const [isOpen, setIsOpen] = useState(false);

  const popover = Ariakit.usePopoverStore({
    open: isOpen,
    setOpen: setIsOpen,
    placement: 'top-start',
  });

  const handleSelectProject = (projectId: string | null) => {
    if (isNewConvo || !conversationId) {
      setConversation?.((prev) => {
        const base = prev ?? conversation;
        if (!base) return prev;
        return { ...base, userProjectId: projectId };
      });
      popover.hide();
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
          popover.hide();
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

  const tooltipText = currentProject
    ? isNewConvo
      ? `${currentProject.name} — ${localize('com_ui_project_selected_for_new_chat')}`
      : currentProject.name
    : localize('com_ui_add_to_project');

  const hasProject = !!currentProjectId;

  return (
    <div className="flex h-9 items-center">
      <TooltipAnchor
        description={tooltipText}
        side="top"
        sideOffset={4}
        render={
          <Ariakit.PopoverDisclosure
            store={popover}
            className={cn(
              'flex items-center justify-center rounded-lg border p-1.5 transition-all cursor-pointer',
              'hover:bg-surface-hover',
              hasProject
                ? 'border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.35)]'
                : 'border-border-medium',
            )}
            render={<button type="button" />}
          >
            <FolderIcon
              className={cn(
                'h-4 w-4 shrink-0',
                hasProject ? 'text-blue-500' : 'text-text-secondary',
              )}
              aria-hidden="true"
            />
          </Ariakit.PopoverDisclosure>
        }
      />
      <Ariakit.Popover
        store={popover}
        portal
        unmountOnHide
        aria-label={localize('com_ui_projects')}
        className={cn(
          'z-40 flex min-w-[200px] max-w-[280px] flex-col rounded-xl',
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
      </Ariakit.Popover>
    </div>
  );
}
