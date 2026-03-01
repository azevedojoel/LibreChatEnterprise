import { Schema } from 'mongoose';
import type { IToolApprovalRecord } from '~/types/toolApprovalRecord';

const toolApprovalRecordSchema = new Schema<IToolApprovalRecord>(
  {
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
      default: '',
    },
    argsSummary: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['approved', 'denied'],
      required: true,
      index: true,
    },
    resolvedAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

toolApprovalRecordSchema.index(
  { conversationId: 1, runId: 1, toolCallId: 1 },
  { unique: true },
);

export default toolApprovalRecordSchema;
