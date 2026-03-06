import { Schema } from 'mongoose';
import type { IToolOverride } from '~/types/toolOverride';

const toolOverrideSchema = new Schema<IToolOverride>(
  {
    toolId: {
      type: String,
      required: true,
      index: true,
    },
    agentId: {
      type: Schema.Types.ObjectId,
      ref: 'Agent',
      default: null,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    description: {
      type: String,
      default: null,
    },
    schema: {
      type: Schema.Types.Mixed,
      default: null,
    },
    requiresApproval: {
      type: Boolean,
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true, collection: 'tooloverrides' },
);

toolOverrideSchema.index({ toolId: 1, agentId: 1, userId: 1 }, { unique: true });

export default toolOverrideSchema;
