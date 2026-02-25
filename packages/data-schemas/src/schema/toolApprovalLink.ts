import { Schema } from 'mongoose';
import type { IToolApprovalLink } from '~/types/toolApprovalLink';

const toolApprovalLinkSchema = new Schema<IToolApprovalLink>(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    runId: {
      type: String,
      required: true,
      index: true,
    },
    toolCallId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    toolName: {
      type: String,
      required: true,
    },
    argsSummary: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'denied'],
      required: true,
      default: 'pending',
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    clickedAt: {
      type: Date,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

toolApprovalLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default toolApprovalLinkSchema;
