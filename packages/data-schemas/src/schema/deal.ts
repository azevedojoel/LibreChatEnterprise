import { Schema } from 'mongoose';
import type { IDeal } from '~/types/deal';

const dealSchema = new Schema<IDeal>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    pipelineId: {
      type: Schema.Types.ObjectId,
      ref: 'Pipeline',
      required: true,
      index: true,
    },
    stage: {
      type: String,
      required: true,
      index: true,
    },
    contactId: {
      type: Schema.Types.ObjectId,
      ref: 'Contact',
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
    },
    value: {
      type: Number,
    },
    expectedCloseDate: {
      type: Date,
    },
    ownerType: {
      type: String,
      enum: ['user', 'agent'],
      required: true,
    },
    ownerId: {
      type: String,
      required: true,
    },
    deletedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

dealSchema.index({ projectId: 1, pipelineId: 1, stage: 1 });
dealSchema.index({ projectId: 1, deletedAt: 1 });
dealSchema.index({ contactId: 1 });
dealSchema.index({ organizationId: 1 });

export default dealSchema;
