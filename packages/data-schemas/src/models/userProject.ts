import userProjectSchema from '~/schema/userProject';
import type { IUserProject } from '~/types/userProject';

/**
 * Creates or returns the UserProject model using the provided mongoose instance and schema
 */
export function createUserProjectModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.UserProject || mongoose.model<IUserProject>('UserProject', userProjectSchema)
  );
}
