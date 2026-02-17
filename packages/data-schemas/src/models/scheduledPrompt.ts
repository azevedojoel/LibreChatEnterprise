import scheduledPromptSchema from '~/schema/scheduledPrompt';
import type { IScheduledPrompt } from '~/types/scheduledPrompt';

export function createScheduledPromptModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.ScheduledPrompt ||
    mongoose.model<IScheduledPrompt>('ScheduledPrompt', scheduledPromptSchema)
  );
}
