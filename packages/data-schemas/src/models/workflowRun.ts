import workflowRunSchema from '~/schema/workflowRun';
import type { IWorkflowRun } from '~/types/workflowRun';

export function createWorkflowRunModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.WorkflowRun ||
    mongoose.model<IWorkflowRun>('WorkflowRun', workflowRunSchema)
  );
}
