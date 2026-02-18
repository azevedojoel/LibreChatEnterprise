import { Schema } from 'mongoose';
import type { IWorkflow } from '~/types/workflow';

const workflowNodeSchema = new Schema(
  {
    id: { type: String, required: true },
    promptGroupId: {
      type: Schema.Types.ObjectId,
      ref: 'PromptGroup',
      required: false,
    },
    agentId: { type: String, required: false },
    position: {
      x: { type: Number, required: true, default: 0 },
      y: { type: Number, required: true, default: 0 },
    },
    selectedTools: { type: [String], default: null },
  },
  { _id: false },
);

const workflowEdgeSchema = new Schema(
  {
    id: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    feedOutputToNext: { type: Boolean, default: true },
  },
  { _id: false },
);

const workflowSchema = new Schema<IWorkflow>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    nodes: {
      type: [workflowNodeSchema],
      default: [],
    },
    edges: {
      type: [workflowEdgeSchema],
      default: [],
    },
    snapshotImage: {
      type: String,
      required: false,
    },
  },
  { timestamps: true, collection: 'workflows' },
);

workflowSchema.index({ userId: 1 });

export default workflowSchema;
