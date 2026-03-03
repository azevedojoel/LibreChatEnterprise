import projectLogSchema from '~/schema/projectLog';
import type { IProjectLog } from '~/types/projectLog';

/**
 * Creates or returns the ProjectLog model using the provided mongoose instance and schema
 */
export function createProjectLogModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.ProjectLog || mongoose.model<IProjectLog>('ProjectLog', projectLogSchema);
}
