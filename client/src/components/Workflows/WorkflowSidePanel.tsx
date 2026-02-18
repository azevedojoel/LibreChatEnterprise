import { useParams } from 'react-router-dom';
import { Button, Sidebar, TooltipAnchor } from '@librechat/client';
import type { TWorkflowNode } from 'librechat-data-provider';
import WorkflowsList from '~/components/Prompts/Groups/WorkflowsList';
import WorkflowRunSection from '~/components/Prompts/Workflows/WorkflowRunSection';
import WorkflowScheduleSection from '~/components/Prompts/Workflows/WorkflowScheduleSection';
import { useGetWorkflowQuery } from '~/data-provider';
import { useWorkflowEditorContext } from '~/Providers/WorkflowEditorContext';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

function isWorkflowValid(nodes: TWorkflowNode[] | undefined): boolean {
  if (!nodes || nodes.length === 0) return true;
  return nodes.every(
    (n) => n.promptGroupId?.trim() && n.agentId?.trim(),
  );
}

export default function WorkflowSidePanel({
  className = '',
  closePanelRef,
  onClose,
}: {
  className?: string;
  closePanelRef?: React.RefObject<HTMLButtonElement>;
  onClose?: () => void;
}) {
  const localize = useLocalize();
  const { workflowId } = useParams<{ workflowId?: string }>();

  const showRunSection = !!workflowId && workflowId !== 'new';
  const { data: workflow } = useGetWorkflowQuery(workflowId ?? '', {
    enabled: showRunSection,
  });
  const { hasUnsavedChanges } = useWorkflowEditorContext();
  const isValid = isWorkflowValid(workflow?.nodes);
  const canRunOrSchedule = isValid && !hasUnsavedChanges;

  return (
    <div
      id="workflows-panel"
      className={cn(
        'flex h-full w-full flex-col md:mr-2 md:w-auto md:min-w-72 lg:w-1/4 xl:w-1/4',
        className,
      )}
    >
      {onClose && (
        <div className="flex items-center justify-between px-2 py-[2px] md:py-2">
          <TooltipAnchor
            description={localize('com_nav_close_sidebar')}
            render={
              <Button
                ref={closePanelRef}
                size="icon"
                variant="outline"
                data-testid="close-workflows-panel-button"
                aria-label={localize('com_nav_close_sidebar')}
                aria-expanded={true}
                className="rounded-full border-none bg-transparent p-2 hover:bg-surface-hover md:rounded-xl"
                onClick={onClose}
              >
                <Sidebar />
              </Button>
            }
          />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 overflow-hidden">
        {showRunSection && (
          <div className="shrink-0 border-b border-border-light px-2 pb-2 pt-2 md:px-0">
            <div className="mb-2 text-sm font-medium text-text-secondary">
              {localize('com_ui_workflows_run_schedule')}
            </div>
            <div className="max-h-[45vh] overflow-y-auto px-2 md:px-0">
              <WorkflowScheduleSection
                workflowId={workflowId!}
                isValid={isValid}
                canRunOrSchedule={canRunOrSchedule}
              />
              <WorkflowRunSection
                workflowId={workflowId!}
                workflowName={workflow?.name ?? ''}
                isValid={isValid}
                canRunOrSchedule={canRunOrSchedule}
              />
            </div>
          </div>
        )}
        <div className="relative flex min-h-0 flex-1 flex-col px-2 pb-3 pt-2 md:px-0">
          <WorkflowsList />
        </div>
      </div>
    </div>
  );
}
