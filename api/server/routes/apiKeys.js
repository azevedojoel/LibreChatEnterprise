const express = require('express');
const { generateCheckAccess, createApiKeyHandlers } = require('@librechat/api');
const { PermissionTypes, Permissions } = require('librechat-data-provider');
const {
  getAgentApiKeyById,
  createAgentApiKey,
  deleteAgentApiKey,
  listAgentApiKeys,
} = require('~/models');
const { requireJwtAuth, requireTermsAccepted } = require('~/server/middleware');
const { getRoleByName } = require('~/models/Role');

const router = express.Router();

const handlers = createApiKeyHandlers({
  createAgentApiKey,
  listAgentApiKeys,
  deleteAgentApiKey,
  getAgentApiKeyById,
});

const checkRemoteAgentsUse = generateCheckAccess({
  permissionType: PermissionTypes.REMOTE_AGENTS,
  permissions: [Permissions.USE],
  getRoleByName,
});

router.post(
  '/',
  requireJwtAuth,
  requireTermsAccepted(),
  checkRemoteAgentsUse,
  handlers.createApiKey,
);

router.get(
  '/',
  requireJwtAuth,
  requireTermsAccepted(),
  checkRemoteAgentsUse,
  handlers.listApiKeys,
);

router.get(
  '/:id',
  requireJwtAuth,
  requireTermsAccepted(),
  checkRemoteAgentsUse,
  handlers.getApiKey,
);

router.delete(
  '/:id',
  requireJwtAuth,
  requireTermsAccepted(),
  checkRemoteAgentsUse,
  handlers.deleteApiKey,
);

module.exports = router;
