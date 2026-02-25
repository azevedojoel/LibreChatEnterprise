import type { Document, Types } from 'mongoose';

export type ToolApprovalLinkStatus = 'pending' | 'approved' | 'denied';

export interface IToolApprovalLink extends Document {
  token: string;
  conversationId: string;
  runId: string;
  toolCallId: string;
  userId: Types.ObjectId;
  toolName: string;
  argsSummary: string;
  status: ToolApprovalLinkStatus;
  createdAt?: Date;
  updatedAt?: Date;
  expiresAt: Date;
  clickedAt?: Date;
  resolvedAt?: Date;
}
