/**
 * Workspace routes for authenticated users (non-admin).
 * GET /api/workspace/me - Returns current user's workspace when they have workspace_id.
 */
const express = require('express');
const { getWorkspaceById } = require('~/models/Workspace');
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
        return res.status(200).json({ workspace: null });
      }
      const workspace = await getWorkspaceById(workspaceId.toString(), 'name slug');
      if (!workspace) {
        return res.status(200).json({ workspace: null });
      }
      return res.status(200).json({
        workspace: {
          id: workspace._id?.toString(),
          name: workspace.name,
          slug: workspace.slug,
        },
      });
    } catch (error) {
      return res.status(500).json({ message: 'Failed to get workspace' });
    }
  },
);

module.exports = router;
