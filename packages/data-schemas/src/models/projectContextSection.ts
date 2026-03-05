import projectContextSectionSchema from '~/schema/projectContextSection';
import type { IProjectContextSection } from '~/types/projectContextSection';

/**
 * Creates or returns the ProjectContextSection model using the provided mongoose instance and schema
 */
export function createProjectContextSectionModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.ProjectContextSection ||
    mongoose.model<IProjectContextSection>('ProjectContextSection', projectContextSectionSchema)
  );
}
