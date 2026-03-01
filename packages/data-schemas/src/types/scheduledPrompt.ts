import type { Document, Types } from 'mongoose';

export type ScheduleType = 'recurring' | 'one-off';
export type ScheduledRunStatus = 'queued' | 'success' | 'failed' | 'running' | 'pending';

export interface IScheduledPrompt extends Document {
  userId: Types.ObjectId;
  agentId: string;
  name: string;
  promptGroupId: Types.ObjectId;
  scheduleType: ScheduleType;
  cronExpression?: string;
  runAt?: Date;
  enabled: boolean;
  timezone?: string;
  lastRunAt?: Date;
  lastRunStatus?: ScheduledRunStatus;
  conversationId?: string;
  selectedTools?: string[] | null;
  emailOnComplete?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IScheduledRun extends Document {
  scheduleId: Types.ObjectId;
  userId: Types.ObjectId;
  conversationId: string;
  /** Actual merged prompt sent to AI; set when execution runs */
  prompt?: string;
  runAt: Date;
  status: ScheduledRunStatus;
  error?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
