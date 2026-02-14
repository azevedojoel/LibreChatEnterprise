const express = require('express');
const { requireAdmin } = require('@librechat/api');
const middleware = require('~/server/middleware');
const AdminInterfaceController = require('~/server/controllers/AdminInterfaceController');

const router = express.Router();

router.post(
  '/clear-cache',
  middleware.optionalJwtAuth,
  AdminInterfaceController.clearConfigCache,
);
router.get(
  '/',
  middleware.requireJwtAuth,
  requireAdmin,
  AdminInterfaceController.getInterfaceSettings,
);
router.patch(
  '/',
  middleware.requireJwtAuth,
  requireAdmin,
  AdminInterfaceController.updateInterfaceSettings,
);

module.exports = router;
