import type { Document, Types } from 'mongoose';

export type EmailProvider = 'mailgun' | 'smtp' | 'postmark';

export type EmailAuditSource =
  | 'auth_verification'
  | 'auth_reset'
  | 'auth_resend'
  | 'admin_invite'
  | 'admin_password_reset'
  | 'sys_admin_invite'
  | 'sys_admin_password_reset'
  | 'send_user_email'
  | 'inbound_reply'
  | 'scheduled_complete'
  | 'tool_approval';

export interface IEventLogMetadata {
  to?: string;
  subject?: string;
  provider?: EmailProvider;
  agentId?: string;
  agentName?: string;
  conversationId?: string;
  runId?: string;
  scheduleId?: string;
  scheduleName?: string;
  toolCallId?: string;
  toolName?: string;
  source?: EmailAuditSource | string;
  messageId?: string;
  success: boolean;
}

export interface IEventLog extends Document {
  type: string;
  event: string;
  userId: Types.ObjectId;
  metadata: IEventLogMetadata;
  createdAt?: Date;
  updatedAt?: Date;
}
