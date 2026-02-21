import organizationSchema from '~/schema/organization';
import type { IOrganization } from '~/types/organization';

/**
 * Creates or returns the Organization model using the provided mongoose instance and schema
 */
export function createOrganizationModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Organization || mongoose.model<IOrganization>('Organization', organizationSchema);
}
