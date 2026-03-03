import inviteSchema from '~/schema/invite';
import type * as t from '~/types';

/**
 * Creates or returns the Invite model using the provided mongoose instance and schema
 */
export function createInviteModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Invite || mongoose.model<t.IInvite>('Invite', inviteSchema);
}
