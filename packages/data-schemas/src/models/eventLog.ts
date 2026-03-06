import eventLogSchema from '~/schema/eventLog';
import type { IEventLog } from '~/types/eventLog';

/**
 * Creates or returns the EventLog model using the provided mongoose instance and schema
 */
export function createEventLogModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.EventLog ||
    mongoose.model<IEventLog>('EventLog', eventLogSchema)
  );
}
