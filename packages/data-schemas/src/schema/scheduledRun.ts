import { Schema } from 'mongoose';
import type { IScheduledRun } from '~/types/scheduledPrompt';

const scheduledRunSchema = new Schema<IScheduledRun>(
  {
    scheduleId: {
      type: Schema.Types.ObjectId,
      ref: 'ScheduledPrompt',
      index: true,
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      required: true,
    },
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    prompt: {
      type: String,
      default: null,
    },
    runAt: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['queued', 'success', 'failed', 'running', 'pending'],
      required: true,
      default: 'pending',
    },
    error: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

scheduledRunSchema.index({ userId: 1, runAt: -1 });
scheduledRunSchema.index({ scheduleId: 1, runAt: -1 });

export default scheduledRunSchema;
