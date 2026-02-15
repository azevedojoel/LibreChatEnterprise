import scheduledRunSchema from '~/schema/scheduledRun';
import type { IScheduledRun } from '~/types/scheduledAgent';

export function createScheduledRunModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.ScheduledRun ||
    mongoose.model<IScheduledRun>('ScheduledRun', scheduledRunSchema)
  );
}
