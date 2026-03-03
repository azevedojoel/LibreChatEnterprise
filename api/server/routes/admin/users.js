const express = require('express');
const { requireAdmin } = require('@librechat/api');
const middleware = require('~/server/middleware');
const AdminUserController = require('~/server/controllers/AdminUserController');

const router = express.Router();

router.get('/', middleware.requireJwtAuth, requireAdmin, AdminUserController.listUsers);
router.post('/', middleware.requireJwtAuth, requireAdmin, AdminUserController.createUser);
router.post('/invite', middleware.requireJwtAuth, requireAdmin, AdminUserController.inviteUser);
router.get('/:userId', middleware.requireJwtAuth, requireAdmin, AdminUserController.getUser);
router.post('/:userId/send-password-reset', middleware.requireJwtAuth, requireAdmin, AdminUserController.sendPasswordResetEmail);
router.patch('/:userId', middleware.requireJwtAuth, requireAdmin, AdminUserController.updateUser);
router.delete('/:userId', middleware.requireJwtAuth, requireAdmin, AdminUserController.deleteUser);

module.exports = router;
