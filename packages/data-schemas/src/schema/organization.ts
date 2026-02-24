import { Schema } from 'mongoose';
import type { IOrganization } from '~/types/organization';

const organizationSchema = new Schema<IOrganization>(
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
    domain: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    deletedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

organizationSchema.index({ projectId: 1, name: 1 });
organizationSchema.index({ projectId: 1, deletedAt: 1 });

export default organizationSchema;
