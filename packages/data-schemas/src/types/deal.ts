import type { Document, Types } from 'mongoose';

export type DealOwnerType = 'user' | 'agent';

export interface IDeal extends Document {
  projectId: Types.ObjectId;
  pipelineId: Types.ObjectId;
  stage: string;
  title?: string;
  description?: string;
  contactId?: Types.ObjectId;
  organizationId?: Types.ObjectId;
  value?: number;
  expectedCloseDate?: Date;
  probability?: number;
  customFields?: Record<string, string | number | boolean>;
  ownerType: DealOwnerType;
  ownerId: string;
  deletedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}
