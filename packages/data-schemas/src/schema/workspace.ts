import { Schema, Document, Types } from 'mongoose';

export interface IWorkspaceRoutingRule {
  topic: string;
  memberId: Types.ObjectId;
  instructions?: string;
}

export interface IMongoWorkspace extends Document {
  name: string;
  slug: string;
  createdBy: Types.ObjectId;
  routingRules?: IWorkspaceRoutingRule[];
  maxMembers?: number;
  adminIds?: Types.ObjectId[];
  createdAt?: Date;
  updatedAt?: Date;
}

const workspaceSchema = new Schema<IMongoWorkspace>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: [/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric and hyphens only'],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    routingRules: {
      type: [
        {
          topic: { type: String, required: true, trim: true },
          memberId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          instructions: { type: String, trim: true },
        },
      ],
      default: [],
    },
    maxMembers: {
      type: Number,
      default: 3,
    },
    adminIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

workspaceSchema.index({ slug: 1 }, { unique: true });

export default workspaceSchema;
