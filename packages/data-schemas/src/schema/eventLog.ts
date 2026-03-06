import { Schema } from 'mongoose';
import type { IEventLog } from '~/types/eventLog';

export type { IEventLog };

const eventLogSchema = new Schema<IEventLog>(
  {
    type: {
      type: String,
      required: true,
      index: true,
    },
    event: {
      type: String,
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'eventlogs',
  },
);

eventLogSchema.index({ type: 1, createdAt: -1 });
eventLogSchema.index({ userId: 1, createdAt: -1 });
eventLogSchema.index({ 'metadata.conversationId': 1 });
eventLogSchema.index({ 'metadata.agentId': 1 });
eventLogSchema.index({ 'metadata.scheduleId': 1 });

export default eventLogSchema;
