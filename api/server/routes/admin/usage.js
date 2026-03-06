const express = require('express');
const { requireAdmin } = require('@librechat/api');
const middleware = require('~/server/middleware');
const AdminUsageController = require('~/server/controllers/AdminUsageController');

const router = express.Router();

router.get('/', middleware.requireJwtAuth, requireAdmin, AdminUsageController.listUsage);
router.get('/aggregate', middleware.requireJwtAuth, requireAdmin, AdminUsageController.aggregateUsage);

module.exports = router;
