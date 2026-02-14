import instanceConfigSchema from '~/schema/instanceConfig';
import type { IInstanceConfig } from '~/schema/instanceConfig';

/**
 * Creates or returns the InstanceConfig model using the provided mongoose instance and schema
 */
export function createInstanceConfigModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.InstanceConfig ||
    mongoose.model<IInstanceConfig>('InstanceConfig', instanceConfigSchema)
  );
}
