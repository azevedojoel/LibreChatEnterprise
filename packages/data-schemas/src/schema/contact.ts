import { Schema } from 'mongoose';
import type { IContact } from '~/types/contact';

const contactSchema = new Schema<IContact>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      index: true,
      sparse: true,
    },
    phone: {
      type: String,
    },
    tags: {
      type: [String],
      default: [],
    },
    source: {
      type: String,
    },
    status: {
      type: String,
      enum: ['lead', 'prospect', 'customer'],
      default: 'lead',
      index: true,
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
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
    },
    lastActivityAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

contactSchema.index({ projectId: 1, email: 1 });
contactSchema.index({ projectId: 1, status: 1 });
contactSchema.index({ projectId: 1, updatedAt: -1 });
contactSchema.index({ projectId: 1, lastActivityAt: 1 });

export default contactSchema;
