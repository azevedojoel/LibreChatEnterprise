import { Schema } from 'mongoose';
import type { IScheduledPrompt } from '~/types/scheduledPrompt';

const scheduledPromptSchema = new Schema<IScheduledPrompt>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      required: true,
    },
    agentId: {
      type: String,
      index: true,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    promptGroupId: {
      type: Schema.Types.ObjectId,
      ref: 'PromptGroup',
      required: true,
      index: true,
    },
    scheduleType: {
      type: String,
      enum: ['recurring', 'one-off'],
      required: true,
    },
    cronExpression: {
      type: String,
      default: null,
    },
    runAt: {
      type: Date,
      default: null,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    timezone: {
      type: String,
      default: 'UTC',
    },
    lastRunAt: {
      type: Date,
      default: null,
    },
    lastRunStatus: {
      type: String,
      enum: ['success', 'failed', 'running', 'pending'],
      default: null,
    },
    conversationId: {
      type: String,
      default: null,
    },
    selectedTools: {
      type: [String],
      default: null,
    },
    emailOnComplete: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true, collection: 'scheduledprompts' },
);

scheduledPromptSchema.index({ userId: 1, enabled: 1 });
scheduledPromptSchema.index({ promptGroupId: 1 });
scheduledPromptSchema.index({ scheduleType: 1, runAt: 1 });
scheduledPromptSchema.index({ enabled: 1, cronExpression: 1 });

export default scheduledPromptSchema;
