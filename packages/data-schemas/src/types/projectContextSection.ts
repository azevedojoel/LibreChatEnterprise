import type { Document, Types } from 'mongoose';

export interface IProjectContextSection extends Document {
  projectId: Types.ObjectId;
  sectionId: string;
  title: string;
  content: string;
  order?: number;
}
