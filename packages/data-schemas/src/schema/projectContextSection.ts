import { Schema } from 'mongoose';
import type { IProjectContextSection } from '~/types/projectContextSection';

const projectContextSectionSchema = new Schema<IProjectContextSection>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'UserProject',
      required: true,
      index: true,
    },
    sectionId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      default: '',
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

projectContextSectionSchema.index({ projectId: 1, sectionId: 1 }, { unique: true });

export default projectContextSectionSchema;
