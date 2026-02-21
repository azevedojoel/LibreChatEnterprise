import { Schema } from 'mongoose';
import type { IPipeline } from '~/types/pipeline';

const pipelineSchema = new Schema<IPipeline>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    stages: {
      type: [String],
      required: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

pipelineSchema.index({ projectId: 1 });

export default pipelineSchema;
