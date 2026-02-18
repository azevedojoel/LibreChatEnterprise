import workflowSchema from '~/schema/workflow';
import type { IWorkflow } from '~/types/workflow';

export function createWorkflowModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.Workflow ||
    mongoose.model<IWorkflow>('Workflow', workflowSchema)
  );
}
