import type { Document, Types } from 'mongoose';

export interface IUserProject extends Document {
  user: string;
  name: string;
  context: string;
  createdAt?: Date;
  updatedAt?: Date;
}
