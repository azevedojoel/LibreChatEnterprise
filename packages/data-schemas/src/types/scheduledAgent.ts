import type { Document, Types } from 'mongoose';

export type ScheduleType = 'recurring' | 'one-off';
export type ScheduledRunStatus = 'queued' | 'success' | 'failed' | 'running' | 'pending';

export interface IScheduledAgent extends Document {
  userId: Types.ObjectId;
  agentId: string;
  name: string;
  prompt: string;
  scheduleType: ScheduleType;
  cronExpression?: string;
  runAt?: Date;
  enabled: boolean;
  timezone?: string;
  lastRunAt?: Date;
  lastRunStatus?: ScheduledRunStatus;
  conversationId?: string;
  selectedTools?: string[] | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IScheduledRun extends Document {
  scheduleId: Types.ObjectId;
  userId: Types.ObjectId;
  conversationId: string;
  runAt: Date;
  status: ScheduledRunStatus;
  error?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
