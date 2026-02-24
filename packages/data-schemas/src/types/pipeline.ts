import type { Document, Types } from 'mongoose';

export interface IPipeline extends Document {
  projectId: Types.ObjectId;
  name: string;
  stages: string[];
  isDefault: boolean;
  deletedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}
