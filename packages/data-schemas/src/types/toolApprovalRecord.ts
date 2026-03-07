import type { Document, Types } from 'mongoose';

export type ToolApprovalRecordStatus = 'approved' | 'denied';

export interface IToolApprovalRecord extends Document {
  conversationId: string;
  runId: string;
  toolCallId: string;
  userId: Types.ObjectId;
  toolName: string;
  argsSummary: string;
  status: ToolApprovalRecordStatus;
  resolvedAt: Date;
  /** User-provided reason when status is 'denied' (for audit/compliance) */
  denialReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
