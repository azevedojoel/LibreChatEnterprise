import { Schema } from 'mongoose';
import type { IWorkflowSchedule } from '~/types/workflowSchedule';

const workflowScheduleSchema = new Schema<IWorkflowSchedule>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      required: true,
    },
    workflowId: {
      type: Schema.Types.ObjectId,
      ref: 'Workflow',
      index: true,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    scheduleType: {
      type: String,
      enum: ['recurring', 'one-off'],
      required: true,
    },
    cronExpression: {
      type: String,
      default: null,
    },
    runAt: {
      type: Date,
      default: null,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    timezone: {
      type: String,
      default: 'UTC',
    },
    lastRunAt: {
      type: Date,
      default: null,
    },
    lastRunStatus: {
      type: String,
      enum: ['success', 'failed', 'running', 'pending'],
      default: null,
    },
  },
  { timestamps: true, collection: 'workflowschedules' },
);

workflowScheduleSchema.index({ userId: 1, enabled: 1 });
workflowScheduleSchema.index({ workflowId: 1 });
workflowScheduleSchema.index({ scheduleType: 1, runAt: 1 });
workflowScheduleSchema.index({ enabled: 1, cronExpression: 1 });

export default workflowScheduleSchema;
