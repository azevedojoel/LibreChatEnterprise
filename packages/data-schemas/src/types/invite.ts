import { Document, Types } from 'mongoose';

export type InviteStatus = 'pending' | 'accepted' | 'expired';

export interface IInvite extends Document {
  email: string;
  workspaceId?: Types.ObjectId;
  tokenHash: string;
  status: InviteStatus;
  createdAt: Date;
  expiresAt: Date;
  invitedBy?: Types.ObjectId;
}
