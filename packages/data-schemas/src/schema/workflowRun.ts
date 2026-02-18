import { Schema } from 'mongoose';
import type { IWorkflowRun } from '~/types/workflowRun';

const workflowRunSchema = new Schema<IWorkflowRun>(
  {
    workflowId: {
      type: Schema.Types.ObjectId,
      ref: 'Workflow',
      index: true,
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      required: true,
    },
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    runAt: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['queued', 'success', 'failed', 'running', 'pending'],
      required: true,
      default: 'pending',
    },
    error: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

workflowRunSchema.index({ userId: 1, runAt: -1 });
workflowRunSchema.index({ workflowId: 1, runAt: -1 });

export default workflowRunSchema;
