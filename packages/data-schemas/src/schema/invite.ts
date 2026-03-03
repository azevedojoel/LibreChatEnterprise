import { Schema } from 'mongoose';
import { IInvite } from '~/types';

const inviteSchema: Schema<IInvite> = new Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
  },
  tokenHash: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'expired'],
    default: 'pending',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  invitedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
});

inviteSchema.index({ workspaceId: 1, status: 1 });
inviteSchema.index({ email: 1 });
inviteSchema.index({ tokenHash: 1 });

export default inviteSchema;
