/**
 * Workspace routes for authenticated users (non-admin).
 * GET /api/workspace/me - Returns current user's workspace when they have workspace_id.
 * GET /api/workspace/me/members - Returns workspace members for current user's workspace.
 */
const express = require('express');
const { getWorkspaceById, isWorkspaceAdmin } = require('~/models/Workspace');
const { findUser } = require('~/models');
const middleware = require('~/server/middleware');

const router = express.Router();

router.get(
  '/me',
  middleware.requireJwtAuth,
  async (req, res) => {
    try {
      const user = await findUser({ _id: req.user?.id }, 'workspace_id');
      const workspaceId = user?.workspace_id;
      if (!workspaceId) {
        return res.status(200).json({ workspace: null, isAdmin: false });
      }
      const workspace = await getWorkspaceById(workspaceId.toString(), 'name slug adminIds createdBy');
      if (!workspace) {
        return res.status(200).json({ workspace: null, isAdmin: false });
      }
      const isAdmin = isWorkspaceAdmin(workspace, req.user?.id);
      return res.status(200).json({
        workspace: {
          id: workspace._id?.toString(),
          name: workspace.name,
          slug: workspace.slug,
        },
        isAdmin,
      });
    } catch (error) {
      return res.status(500).json({ message: 'Failed to get workspace' });
    }
  },
);

router.get(
  '/me/members',
  middleware.requireJwtAuth,
  async (req, res) => {
    try {
      const user = await findUser({ _id: req.user?.id }, 'workspace_id');
      const workspaceId = user?.workspace_id;
      if (!workspaceId) {
        return res.status(200).json({ members: [] });
      }
      const workspace = await getWorkspaceById(workspaceId.toString());
      if (!workspace) {
        return res.status(200).json({ members: [] });
      }
      const User = require('~/db/models').User;
      const members = await User.find({ workspace_id: workspaceId })
        .select('_id email name username role')
        .lean();

      const sanitized = members.map((u) => ({
        _id: u._id?.toString(),
        id: u._id?.toString(),
        email: u.email,
        name: u.name,
        username: u.username,
        role: u.role,
      }));

      return res.status(200).json({ members: sanitized });
    } catch (error) {
      return res.status(500).json({ message: 'Failed to list workspace members' });
    }
  },
);

module.exports = router;
