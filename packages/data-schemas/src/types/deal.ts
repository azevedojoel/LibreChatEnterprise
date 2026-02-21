import type { Document, Types } from 'mongoose';

export type DealOwnerType = 'user' | 'agent';

export interface IDeal extends Document {
  projectId: Types.ObjectId;
  pipelineId: Types.ObjectId;
  stage: string;
  contactId?: Types.ObjectId;
  organizationId?: Types.ObjectId;
  value?: number;
  expectedCloseDate?: Date;
  ownerType: DealOwnerType;
  ownerId: string;
  createdAt?: Date;
  updatedAt?: Date;
}
