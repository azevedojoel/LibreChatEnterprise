import type { Document, Types } from 'mongoose';

export type ContactStatus = 'lead' | 'prospect' | 'customer';
export type OwnerType = 'user' | 'agent';

export interface IContact extends Document {
  projectId: Types.ObjectId;
  name: string;
  email?: string;
  phone?: string;
  tags: string[];
  source?: string;
  status: ContactStatus;
  ownerType: OwnerType;
  ownerId: string;
  organizationId?: Types.ObjectId;
  customFields?: Record<string, string | number | boolean>;
  lastActivityAt?: Date;
  deletedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}
