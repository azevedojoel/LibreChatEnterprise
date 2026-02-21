import contactSchema from '~/schema/contact';
import type { IContact } from '~/types/contact';

/**
 * Creates or returns the Contact model using the provided mongoose instance and schema
 */
export function createContactModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Contact || mongoose.model<IContact>('Contact', contactSchema);
}
