import toolApprovalLinkSchema from '~/schema/toolApprovalLink';
import type { IToolApprovalLink } from '~/types/toolApprovalLink';

export function createToolApprovalLinkModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.ToolApprovalLink ||
    mongoose.model<IToolApprovalLink>('ToolApprovalLink', toolApprovalLinkSchema)
  );
}
