import type { Document, Types } from 'mongoose';

export interface IProjectLog extends Document {
  projectId: Types.ObjectId;
  timestamp: Date;
  entry: string;
}
