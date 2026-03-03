const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { checkEmailConfig } = require('@librechat/api');
const {
  listWorkspaces,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  getWorkspaceById,
} = require('~/models/Workspace');
const { findUser } = require('~/models');
const { createInvite } = require('~/models/inviteUser');
const { listInvitesByWorkspace, markExpiredInvites } = require('~/models/Invite');
const { sendEmail } = require('~/server/utils');

/**
 * List all workspaces (admin only)
 */
const list = async (req, res) => {
  try {
    const workspaces = await listWorkspaces();
    return res.status(200).json(workspaces);
  } catch (error) {
    logger.error('[AdminWorkspaceController.list]', error);
    return res.status(500).json({ message: 'Failed to list workspaces' });
  }
};

/**
 * Create workspace (admin only)
 * Body: { name, slug }
 */
const create = async (req, res) => {
  try {
    const { name, slug } = req.body;
    const adminId = req.user?.id;

    if (!name || !slug) {
      return res.status(400).json({ message: 'name and slug are required' });
    }

    const workspace = await createWorkspace({
      name: name.trim(),
      slug: slug.trim(),
      createdBy: adminId,
    });

    return res.status(201).json({
      _id: workspace._id,
      id: workspace._id?.toString(),
      name: workspace.name,
      slug: workspace.slug,
      createdBy: workspace.createdBy,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    });
  } catch (error) {
    if (error.message?.includes('already exists') || error.code === 11000) {
      return res.status(409).json({
        message: error.message?.includes('already exists')
          ? error.message
          : 'Workspace with this slug already exists',
      });
    }
    logger.error('[AdminWorkspaceController.create]', error);
    return res.status(500).json({ message: 'Failed to create workspace' });
  }
};

/**
 * Get workspace by ID (admin only)
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;
    const workspace = await getWorkspaceById(id);

    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    return res.status(200).json({
      _id: workspace._id,
      id: workspace._id?.toString(),
      name: workspace.name,
      slug: workspace.slug,
      createdBy: workspace.createdBy,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    });
  } catch (error) {
    logger.error('[AdminWorkspaceController.getById]', error);
    return res.status(500).json({ message: 'Failed to get workspace' });
  }
};

/**
 * Update workspace (admin only)
 * Body: { name?, slug? }
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug } = req.body;

    const workspace = await updateWorkspace(id, { name, slug });

    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    return res.status(200).json({
      _id: workspace._id,
      id: workspace._id?.toString(),
      name: workspace.name,
      slug: workspace.slug,
      createdBy: workspace.createdBy,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    });
  } catch (error) {
    if (error.message?.includes('already exists') || error.code === 11000) {
      return res.status(409).json({
        message: error.message?.includes('already exists')
          ? error.message
          : 'Workspace with this slug already exists',
      });
    }
    logger.error('[AdminWorkspaceController.update]', error);
    return res.status(500).json({ message: 'Failed to update workspace' });
  }
};

/**
 * Delete workspace (admin only)
 * Clears workspace_id from all users first.
 */
const remove = async (req, res) => {
  try {
    const { id } = req.params;

    const workspace = await getWorkspaceById(id);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    await deleteWorkspace(id);
    return res.status(200).json({ message: 'Workspace deleted' });
  } catch (error) {
    logger.error('[AdminWorkspaceController.remove]', error);
    return res.status(500).json({ message: 'Failed to delete workspace' });
  }
};

/**
 * List workspace members (admin only)
 */
const listMembers = async (req, res) => {
  try {
    const { id } = req.params;
    const User = require('~/db/models').User;

    const workspace = await getWorkspaceById(id);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    const members = await User.find({ workspace_id: id })
      .select('_id email name username role')
      .lean();

    const sanitized = members.map((u) => ({
      _id: u._id,
      id: u._id?.toString(),
      email: u.email,
      name: u.name,
      username: u.username,
      role: u.role,
    }));

    return res.status(200).json({ members: sanitized });
  } catch (error) {
    logger.error('[AdminWorkspaceController.listMembers]', error);
    return res.status(500).json({ message: 'Failed to list members' });
  }
};

/**
 * Invite user to workspace (admin only)
 * Body: { email }
 * If user exists: assign workspace_id (reject if already in another workspace)
 * If user does not exist: create invite with workspace, send email or return link
 */
const invite = async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'email is required' });
    }

    const workspace = await getWorkspaceById(id);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const User = require('~/db/models').User;
    const user = await findUser({ email: normalizedEmail }, '_id email workspace_id');

    if (user) {
      if (user.workspace_id && user.workspace_id.toString() !== id) {
        return res.status(409).json({
          message: 'User is already in another workspace. Remove them first to transfer.',
        });
      }

      if (user.workspace_id && user.workspace_id.toString() === id) {
        return res.status(200).json({ message: 'User is already in this workspace' });
      }

      const workspaceObjId = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
      await User.updateOne({ _id: user._id }, { $set: { workspace_id: workspaceObjId } });

      return res.status(200).json({
        message: 'User added to workspace',
        user: { id: user._id?.toString(), email: user.email },
      });
    }

    const token = await createInvite(normalizedEmail, {
      workspaceId: id,
      invitedBy: req.user?.id,
    });

    if (token && typeof token === 'object' && token.message) {
      return res.status(500).json({ message: token.message });
    }

    const domainClient = process.env.DOMAIN_CLIENT || 'http://localhost:3080';
    const inviteLink = `${domainClient}/register?token=${token}`;
    const appName = process.env.APP_TITLE || 'LibreChat';

    if (checkEmailConfig()) {
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
      logger.info(`[AdminWorkspaceController.invite] Invitation sent. [Email: ${normalizedEmail}] [Workspace: ${id}]`);
      return res.status(200).json({ message: 'Invitation sent successfully' });
    }

    return res.status(200).json({
      message: 'Invitation created. Email is not configured. Share this link with the user.',
      link: inviteLink,
    });
  } catch (error) {
    logger.error('[AdminWorkspaceController.invite]', error);
    return res.status(500).json({ message: 'Failed to invite user' });
  }
};

/**
 * List workspace invites (admin only)
 */
const listInvites = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.query;

    const workspace = await getWorkspaceById(id);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    await markExpiredInvites(id);

    const invites = await listInvitesByWorkspace(id, {
      status: status || undefined,
      limit: 100,
    });

    return res.status(200).json({ invites });
  } catch (error) {
    logger.error('[AdminWorkspaceController.listInvites]', error);
    return res.status(500).json({ message: 'Failed to list invites' });
  }
};

/**
 * Remove member from workspace (admin only)
 */
const removeMember = async (req, res) => {
  try {
    const { id, userId } = req.params;

    const workspace = await getWorkspaceById(id);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    const User = require('~/db/models').User;
    const result = await User.updateOne(
      { _id: userId, workspace_id: id },
      { $unset: { workspace_id: '' } },
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: 'User not in this workspace or not found' });
    }

    return res.status(200).json({ message: 'Member removed from workspace' });
  } catch (error) {
    logger.error('[AdminWorkspaceController.removeMember]', error);
    return res.status(500).json({ message: 'Failed to remove member' });
  }
};

module.exports = {
  list,
  create,
  getById,
  update,
  remove,
  listMembers,
  listInvites,
  invite,
  removeMember,
};
