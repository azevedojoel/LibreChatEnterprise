import { Schema } from 'mongoose';
import type { IUserProject } from '~/types/userProject';

const userProjectSchema = new Schema<IUserProject>(
  {
    user: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      index: true,
    },
    context: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      default: '',
    },
    tags: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
      index: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    workspace_id: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

userProjectSchema.index({ user: 1 });
userProjectSchema.index({ user: 1, name: 1 }, { unique: true });
userProjectSchema.index({ workspace_id: 1 });
userProjectSchema.index({ status: 1 });

export default userProjectSchema;
