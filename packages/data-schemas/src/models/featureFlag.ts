import featureFlagSchema from '~/schema/featureFlag';
import type { IFeatureFlag } from '~/types/featureFlag';

export function createFeatureFlagModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.FeatureFlag ||
    mongoose.model<IFeatureFlag>('FeatureFlag', featureFlagSchema)
  );
}
