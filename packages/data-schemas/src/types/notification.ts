import type { Document, Types } from 'mongoose';

export type NotificationType = 'workspace_message' | 'tool_approval' | 'human_notify' | 'scheduled_run_complete';

export interface INotification extends Document {
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  readAt?: Date;
  createdAt?: Date;
  metadata?: Record<string, unknown>;
}
