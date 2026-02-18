import workflowScheduleSchema from '~/schema/workflowSchedule';
import type { IWorkflowSchedule } from '~/types/workflowSchedule';

export function createWorkflowScheduleModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.WorkflowSchedule ||
    mongoose.model<IWorkflowSchedule>('WorkflowSchedule', workflowScheduleSchema)
  );
}
