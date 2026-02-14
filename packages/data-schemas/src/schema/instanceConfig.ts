import { Schema, Document } from 'mongoose';

export interface IInstanceConfig extends Document {
  key: string;
  visibleEndpoints?: string[];
}

const instanceConfigSchema = new Schema<IInstanceConfig>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'default',
    },
    visibleEndpoints: {
      type: [String],
      default: undefined,
    },
  },
  { timestamps: true },
);

export default instanceConfigSchema;
