import type { Document, Types } from 'mongoose';

export interface IOrganization extends Document {
  projectId: Types.ObjectId;
  name: string;
  domain?: string;
  metadata?: Record<string, unknown>;
  deletedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}
