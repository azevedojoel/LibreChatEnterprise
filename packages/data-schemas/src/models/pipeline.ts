import pipelineSchema from '~/schema/pipeline';
import type { IPipeline } from '~/types/pipeline';

/**
 * Creates or returns the Pipeline model using the provided mongoose instance and schema
 */
export function createPipelineModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Pipeline || mongoose.model<IPipeline>('Pipeline', pipelineSchema);
}
