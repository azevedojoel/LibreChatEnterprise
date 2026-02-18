import type { Document, Types } from 'mongoose';

export type WorkflowScheduleType = 'recurring' | 'one-off';

export interface IWorkflowSchedule extends Document {
  userId: Types.ObjectId;
  workflowId: Types.ObjectId;
  name: string;
  scheduleType: WorkflowScheduleType;
  cronExpression?: string;
  runAt?: Date;
  enabled: boolean;
  timezone?: string;
  lastRunAt?: Date;
  lastRunStatus?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
