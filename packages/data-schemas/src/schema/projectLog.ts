import { Schema } from 'mongoose';
import type { IProjectLog } from '~/types/projectLog';

const projectLogSchema = new Schema<IProjectLog>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'UserProject',
      required: true,
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    entry: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: false,
  },
);

projectLogSchema.index({ projectId: 1, timestamp: -1 });

export default projectLogSchema;
