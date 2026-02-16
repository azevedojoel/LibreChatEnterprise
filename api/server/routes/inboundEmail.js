const express = require('express');
const inboundEmailController = require('~/server/controllers/inboundEmail');

const router = express.Router();

/**
 * Inbound email webhook - MUST use express.raw() to preserve body for signature verification.
 * Mounted at /api/inbound/email/:pathSecret
 * Path secret must match INBOUND_EMAIL_PATH_SECRET env var.
 */
router.post(
  '/:pathSecret',
  express.raw({ type: 'application/json', limit: '1mb' }),
  inboundEmailController.handleInboundEmail,
);

module.exports = router;
