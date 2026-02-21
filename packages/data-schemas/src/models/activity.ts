import activitySchema from '~/schema/activity';
import type { IActivity } from '~/types/activity';

/**
 * Creates or returns the Activity model using the provided mongoose instance and schema
 */
export function createActivityModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Activity || mongoose.model<IActivity>('Activity', activitySchema);
}
