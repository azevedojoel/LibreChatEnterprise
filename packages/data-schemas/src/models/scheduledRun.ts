import scheduledRunSchema from '~/schema/scheduledRun';
import type { IScheduledRun } from '~/types/scheduledPrompt';

export function createScheduledRunModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.ScheduledRun ||
    mongoose.model<IScheduledRun>('ScheduledRun', scheduledRunSchema)
  );
}
