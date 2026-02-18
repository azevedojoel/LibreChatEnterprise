import { FileText, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Skeleton } from '@librechat/client';
import type { TWorkflow } from 'librechat-data-provider';
import { useGetWorkflowsQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function WorkflowsList() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { data: workflows = [], isLoading } = useGetWorkflowsQuery();

  return (
    <div className="flex h-full flex-col">
      <div className="mt-2 flex w-full justify-end">
        <Button
          asChild
          variant="outline"
          className="mx-2 w-full bg-transparent"
          aria-label={localize('com_ui_workflows_create')}
        >
          <Link to="/d/workflows/new">
            <Plus className="size-4" aria-hidden="true" />
            {localize('com_ui_workflows_create')}
          </Link>
        </Button>
      </div>
      <div className="flex-grow overflow-y-auto" aria-label={localize('com_ui_workflows')}>
        <div className="overflow-y-auto overflow-x-hidden">
          {isLoading &&
            Array.from({ length: 5 }).map((_, index: number) => (
              <Skeleton
                key={index}
                className="w-100 mx-2 my-2 flex h-14 rounded-lg border-0 p-4"
              />
            ))}
          {!isLoading && workflows.length === 0 && (
            <div
              className={cn(
                'flex flex-col items-center justify-center rounded-lg border border-border-light bg-transparent p-6 text-center',
                'mx-2 my-4',
              )}
            >
              <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-surface-tertiary">
                <FileText className="size-5 text-text-secondary" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-text-primary">
                {localize('com_ui_workflows_no_workflows')}
              </p>
              <p className="mt-0.5 text-xs text-text-secondary">
                {localize('com_ui_workflows_add_first')}
              </p>
            </div>
          )}
          {!isLoading &&
            workflows.map((workflow: TWorkflow) => (
              <div
                key={workflow._id}
                className={cn(
                  'relative mx-2 my-2 cursor-pointer overflow-hidden rounded-lg border border-border-light bg-surface-primary p-3 shadow-sm transition-all duration-300 ease-in-out hover:bg-surface-secondary',
                )}
              >
                {workflow.snapshotImage && (
                  <div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-25"
                    aria-hidden
                  >
                    <div
                      className="absolute aspect-[4/3] w-[65%] rounded-lg border border-border-light bg-surface-primary-alt shadow-md"
                      style={{
                        transform: 'rotate(-2deg)',
                        transformOrigin: 'center',
                        backgroundImage: `url(${workflow.snapshotImage})`,
                        backgroundSize: 'contain',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat',
                      }}
                    />
                  </div>
                )}
                <button
                  type="button"
                  className="relative flex w-full items-center justify-between rounded-lg text-left"
                  onClick={() => navigate(`/d/workflows/${workflow._id}`)}
                >
                  <span className="truncate text-sm font-semibold text-text-primary">
                    {workflow.name}
                  </span>
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
