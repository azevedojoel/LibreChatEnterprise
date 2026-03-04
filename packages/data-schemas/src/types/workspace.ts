import type { Document, Types } from 'mongoose';

export interface IWorkspaceRoutingRule {
  topic: string;
  memberId: Types.ObjectId;
  instructions?: string;
}

export interface IWorkspace extends Document {
  name: string;
  slug: string;
  createdBy: Types.ObjectId;
  routingRules?: IWorkspaceRoutingRule[];
  maxMembers?: number;
  adminIds?: Types.ObjectId[];
  createdAt?: Date;
  updatedAt?: Date;
}
