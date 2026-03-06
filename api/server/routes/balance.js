const express = require('express');
const router = express.Router();
const controller = require('../controllers/Balance');
const { requireJwtAuth, requireTermsAccepted } = require('../middleware/');

router.get('/', requireJwtAuth, requireTermsAccepted(), controller);

module.exports = router;
