import toolOverrideSchema from '~/schema/toolOverride';
import type { IToolOverride } from '~/types/toolOverride';

export function createToolOverrideModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.ToolOverride ||
    mongoose.model<IToolOverride>('ToolOverride', toolOverrideSchema)
  );
}
