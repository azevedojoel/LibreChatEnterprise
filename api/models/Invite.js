const { Invite } = require('~/db/models');

const INVITE_EXPIRY_SECONDS = 604800; // 7 days

/**
 * Create an invite record (for tracking). Called after creating the Token.
 * @param {Object} data - { email, tokenHash, workspaceId?, invitedBy? }
 * @returns {Promise<Object>}
 */
const createInviteRecord = async (data) => {
  const { email, tokenHash, workspaceId, invitedBy } = data;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_EXPIRY_SECONDS * 1000);

  const invite = await Invite.create({
    email: email.trim().toLowerCase(),
    tokenHash,
    workspaceId: workspaceId || undefined,
    invitedBy: invitedBy || undefined,
    status: 'pending',
    expiresAt,
  });

  return invite.toObject ? invite.toObject() : invite;
};

/**
 * Find invite by token hash and update status.
 * @param {string} tokenHash
 * @param {string} newStatus - 'accepted' | 'expired'
 * @returns {Promise<Object|null>}
 */
const updateInviteStatusByTokenHash = async (tokenHash, newStatus) => {
  const invite = await Invite.findOneAndUpdate(
    { tokenHash, status: 'pending' },
    { $set: { status: newStatus } },
    { new: true },
  ).lean();

  return invite;
};

/**
 * List invites for a workspace.
 * @param {string} workspaceId
 * @param {Object} options - { status?, limit?, skip? }
 * @returns {Promise<Array>}
 */
const listInvitesByWorkspace = async (workspaceId, options = {}) => {
  const { status, limit = 50, skip = 0 } = options;
  const query = { workspaceId };
  if (status) {
    query.status = status;
  }

  const invites = await Invite.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return invites.map((inv) => ({
    ...inv,
    id: inv._id?.toString(),
    _id: inv._id,
  }));
};

/**
 * List all invites (for admin).
 * @param {Object} options - { workspaceId?, status?, limit?, skip? }
 * @returns {Promise<Array>}
 */
const listInvites = async (options = {}) => {
  const { workspaceId, status, limit = 50, skip = 0 } = options;
  const query = {};
  if (workspaceId) query.workspaceId = workspaceId;
  if (status) query.status = status;

  const invites = await Invite.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('workspaceId', 'name slug')
    .lean();

  return invites.map((inv) => ({
    ...inv,
    id: inv._id?.toString(),
    _id: inv._id,
  }));
};

/**
 * Mark expired invites (cron or on read).
 * @param {string} [workspaceId]
 */
const markExpiredInvites = async (workspaceId) => {
  const query = { status: 'pending', expiresAt: { $lt: new Date() } };
  if (workspaceId) query.workspaceId = workspaceId;
  await Invite.updateMany(query, { $set: { status: 'expired' } });
};

module.exports = {
  createInviteRecord,
  updateInviteStatusByTokenHash,
  listInvitesByWorkspace,
  listInvites,
  markExpiredInvites,
};
