const express = require('express');
const inboundTelegramController = require('~/server/controllers/inboundTelegram');
const { inboundTelegramLimiter } = require('~/server/middleware/limiters');

const router = express.Router();

/**
 * Telegram webhook - receives Update objects from Telegram.
 * Mounted at /api/inbound/telegram/:pathSecret
 * Path secret must match INBOUND_TELEGRAM_PATH_SECRET env var.
 */
router.post(
  '/:pathSecret',
  inboundTelegramLimiter,
  express.json({ limit: '1mb' }),
  inboundTelegramController.handleInboundTelegram,
);

module.exports = router;
