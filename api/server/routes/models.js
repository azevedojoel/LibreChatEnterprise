const express = require('express');
const { modelController } = require('~/server/controllers/ModelController');
const { requireJwtAuth, requireTermsAccepted } = require('~/server/middleware/');

const router = express.Router();
router.get('/', requireJwtAuth, requireTermsAccepted(), modelController);

module.exports = router;
