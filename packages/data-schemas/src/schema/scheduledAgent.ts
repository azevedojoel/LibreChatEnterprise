import { Schema } from 'mongoose';
import type { IScheduledAgent } from '~/types/scheduledAgent';

const scheduledAgentSchema = new Schema<IScheduledAgent>(
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
    prompt: {
      type: String,
      required: true,
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
  },
  { timestamps: true },
);

scheduledAgentSchema.index({ userId: 1, enabled: 1 });
scheduledAgentSchema.index({ scheduleType: 1, runAt: 1 });
scheduledAgentSchema.index({ enabled: 1, cronExpression: 1 });

export default scheduledAgentSchema;
