import type { Document, Types } from 'mongoose';

export type ActivityType =
  | 'email_sent'
  | 'email_received'
  | 'call_logged'
  | 'agent_action'
  | 'doc_matched'
  | 'stage_change'
  | 'contact_created'
  | 'contact_updated'
  | 'deal_created'
  | 'deal_updated';

export type ActivityActorType = 'user' | 'agent';

export interface IActivity extends Document {
  projectId: Types.ObjectId;
  contactId?: Types.ObjectId;
  dealId?: Types.ObjectId;
  type: ActivityType;
  actorType: ActivityActorType;
  actorId: string;
  conversationId?: string;
  messageId?: string;
  toolName?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}
