import type { Document, Types } from 'mongoose';

export interface IWorkspace extends Document {
  name: string;
  slug: string;
  createdBy: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}
