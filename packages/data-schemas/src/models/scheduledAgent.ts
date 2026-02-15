import scheduledAgentSchema from '~/schema/scheduledAgent';
import type { IScheduledAgent } from '~/types/scheduledAgent';

export function createScheduledAgentModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.ScheduledAgent ||
    mongoose.model<IScheduledAgent>('ScheduledAgent', scheduledAgentSchema)
  );
}
