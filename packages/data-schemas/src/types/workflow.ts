import type { Document, Types } from 'mongoose';

export interface IWorkflowNode {
  id: string;
  promptGroupId: Types.ObjectId;
  agentId: string;
  position: { x: number; y: number };
  selectedTools?: string[] | null;
}

export interface IWorkflowEdge {
  id: string;
  source: string;
  target: string;
  feedOutputToNext?: boolean;
}

export interface IWorkflow extends Document {
  userId: Types.ObjectId;
  name: string;
  nodes: IWorkflowNode[];
  edges: IWorkflowEdge[];
  snapshotImage?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
