import type { Document, Types } from 'mongoose';

export type WorkflowRunStatus = 'queued' | 'running' | 'success' | 'failed' | 'pending';

export interface IWorkflowRun extends Document {
  workflowId: Types.ObjectId;
  userId: Types.ObjectId;
  conversationId: string;
  runAt: Date;
  status: WorkflowRunStatus;
  error?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
