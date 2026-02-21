import { Schema } from 'mongoose';
import type { IActivity } from '~/types/activity';

const activitySchema = new Schema<IActivity>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    contactId: {
      type: Schema.Types.ObjectId,
      ref: 'Contact',
      index: true,
    },
    dealId: {
      type: Schema.Types.ObjectId,
      ref: 'Deal',
      index: true,
    },
    type: {
      type: String,
      enum: [
        'email_sent',
        'email_received',
        'call_logged',
        'agent_action',
        'doc_matched',
        'stage_change',
        'contact_created',
        'contact_updated',
        'deal_created',
        'deal_updated',
      ],
      required: true,
    },
    actorType: {
      type: String,
      enum: ['user', 'agent'],
      required: true,
    },
    actorId: {
      type: String,
      required: true,
    },
    conversationId: {
      type: String,
    },
    messageId: {
      type: String,
    },
    toolName: {
      type: String,
    },
    summary: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  { timestamps: true },
);

activitySchema.index({ contactId: 1, createdAt: -1 });
activitySchema.index({ dealId: 1, createdAt: -1 });
activitySchema.index({ projectId: 1, createdAt: -1 });

export default activitySchema;
