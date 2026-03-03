const express = require('express');
const { requireAdmin } = require('@librechat/api');
const middleware = require('~/server/middleware');
const AdminWorkspaceController = require('~/server/controllers/AdminWorkspaceController');

const router = express.Router();

router.get('/', middleware.requireJwtAuth, requireAdmin, AdminWorkspaceController.list);
router.post('/', middleware.requireJwtAuth, requireAdmin, AdminWorkspaceController.create);
router.get('/:id', middleware.requireJwtAuth, requireAdmin, AdminWorkspaceController.getById);
router.patch('/:id', middleware.requireJwtAuth, requireAdmin, AdminWorkspaceController.update);
router.delete('/:id', middleware.requireJwtAuth, requireAdmin, AdminWorkspaceController.remove);
router.get('/:id/members', middleware.requireJwtAuth, requireAdmin, AdminWorkspaceController.listMembers);
router.get('/:id/invites', middleware.requireJwtAuth, requireAdmin, AdminWorkspaceController.listInvites);
router.post('/:id/invite', middleware.requireJwtAuth, requireAdmin, AdminWorkspaceController.invite);
router.delete(
  '/:id/members/:userId',
  middleware.requireJwtAuth,
  requireAdmin,
  AdminWorkspaceController.removeMember,
);

module.exports = router;
