/** Error codes for inviteUserToWorkspace (used for HTTP status mapping) */
const INVITE_ERROR_CODES = {
  MEMBER_LIMIT: 'MEMBER_LIMIT',
  ALREADY_IN_ANOTHER_WORKSPACE: 'ALREADY_IN_ANOTHER_WORKSPACE',
};

/**
 * Invite a user to a workspace.
 * Shared logic used by AdminWorkspaceController and human_invite_to_workspace tool.
 *
 * @param {Object} params
 * @param {string} params.workspaceId - Workspace ID
 * @param {string} params.email - Email to invite
 * @param {string} [params.invitedBy] - User ID of inviter
 * @returns {Promise<{ success: boolean; message?: string; link?: string; user?: { id: string; email: string }; error?: string; errorCode?: string }>}
 */
const inviteUserToWorkspace = async ({ workspaceId, email, invitedBy }) => {
  const mongoose = require('mongoose');
  const { logger } = require('@librechat/data-schemas');
  const { checkEmailConfig } = require('@librechat/api');
  const { getWorkspaceById } = require('~/models/Workspace');
  const { findUser } = require('~/models');
  const { createInvite } = require('~/models/inviteUser');
  const { User, Invite } = require('~/db/models');
  const sendEmail = require('~/server/utils/sendEmail');

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return { success: false, error: 'email is required' };
  }

  const workspace = await getWorkspaceById(workspaceId, 'name maxMembers');
  if (!workspace) {
    return { success: false, error: 'Workspace not found' };
  }

  const maxMembers = workspace.maxMembers ?? 3;
  const memberCount = await User.countDocuments({ workspace_id: workspaceId });
  const pendingCount = await Invite.countDocuments({
    workspaceId,
    status: 'pending',
  });

  if (memberCount + pendingCount >= maxMembers) {
    return {
      success: false,
      error: `Workspace member limit reached (max ${maxMembers}).`,
      errorCode: INVITE_ERROR_CODES.MEMBER_LIMIT,
    };
  }

  const user = await findUser({ email: normalizedEmail }, '_id email workspace_id');

  if (user) {
    if (user.workspace_id && user.workspace_id.toString() !== workspaceId) {
      return {
        success: false,
        error: 'User is already in another workspace. Remove them first to transfer.',
        errorCode: INVITE_ERROR_CODES.ALREADY_IN_ANOTHER_WORKSPACE,
      };
    }

    if (user.workspace_id && user.workspace_id.toString() === workspaceId) {
      return {
        success: true,
        message: 'User is already in this workspace',
        user: { id: user._id?.toString(), email: user.email },
      };
    }

    const workspaceObjId =
      mongoose.Types.ObjectId.isValid(workspaceId)
        ? new mongoose.Types.ObjectId(workspaceId)
        : workspaceId;
    await User.updateOne({ _id: user._id }, { $set: { workspace_id: workspaceObjId } });

    return {
      success: true,
      message: 'User added to workspace',
      user: { id: user._id?.toString(), email: user.email },
    };
  }

  const token = await createInvite(normalizedEmail, {
    workspaceId,
    invitedBy,
  });

  if (token && typeof token === 'object' && token.message) {
    return { success: false, error: token.message };
  }

  const domainClient = process.env.DOMAIN_CLIENT || 'http://localhost:3080';
  const inviteLink = `${domainClient}/register?token=${token}`;
  const appName = process.env.APP_TITLE || 'Daily Thread';

  if (checkEmailConfig()) {
    try {
      await sendEmail({
        email: normalizedEmail,
        subject: `Invite to join ${workspace.name} on ${appName}!`,
        payload: {
          appName,
          inviteLink,
          workspaceName: workspace.name,
          year: new Date().getFullYear(),
        },
        template: 'inviteUser.handlebars',
      });
      logger.info(`[inviteUserToWorkspace] Invitation sent. [Email: ${normalizedEmail}] [Workspace: ${workspaceId}]`);
      return { success: true, message: 'Invitation sent successfully' };
    } catch (err) {
      logger.error('[inviteUserToWorkspace] sendEmail failed', err);
      return { success: false, error: err.message || 'Failed to send invitation email' };
    }
  }

  return {
    success: true,
    message: 'Invitation created. Email is not configured. Share this link with the user.',
    link: inviteLink,
  };
};

module.exports = { inviteUserToWorkspace, INVITE_ERROR_CODES };
