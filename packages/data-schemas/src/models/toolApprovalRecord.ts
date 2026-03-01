import toolApprovalRecordSchema from '~/schema/toolApprovalRecord';
import type { IToolApprovalRecord } from '~/types/toolApprovalRecord';

export function createToolApprovalRecordModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.ToolApprovalRecord ||
    mongoose.model<IToolApprovalRecord>('ToolApprovalRecord', toolApprovalRecordSchema)
  );
}
