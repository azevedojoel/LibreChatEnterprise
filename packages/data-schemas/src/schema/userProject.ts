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
  },
  {
    timestamps: true,
  },
);

userProjectSchema.index({ user: 1 });
userProjectSchema.index({ user: 1, name: 1 }, { unique: true });

export default userProjectSchema;
