import type { Document, Types } from 'mongoose';

export interface IFeatureFlag extends Document {
  key: string;
  /** Override value: boolean, string, number, or object */
  value: boolean | string | number | Record<string, unknown>;
  description?: string | null;
  createdBy: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}
