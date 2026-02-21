import dealSchema from '~/schema/deal';
import type { IDeal } from '~/types/deal';

/**
 * Creates or returns the Deal model using the provided mongoose instance and schema
 */
export function createDealModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Deal || mongoose.model<IDeal>('Deal', dealSchema);
}
