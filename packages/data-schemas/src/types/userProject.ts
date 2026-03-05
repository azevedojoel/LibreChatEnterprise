import type { Document, Types } from 'mongoose';

export type UserProjectStatus = 'active' | 'archived';

export interface IUserProject extends Document {
  user: string;
  name: string;
  context: string;
  description?: string;
  tags?: string[];
  status?: UserProjectStatus;
  ownerId?: Types.ObjectId | null;
  workspace_id?: Types.ObjectId | null;
  createdAt?: Date;
  updatedAt?: Date;
}
