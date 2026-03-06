const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const {
  connectTelegram,
  getTelegramStatus,
  disconnectTelegram,
} = require('~/server/controllers/telegram');

const router = express.Router();

router.post('/connect', requireJwtAuth, connectTelegram);
router.get('/status', requireJwtAuth, getTelegramStatus);
router.delete('/disconnect', requireJwtAuth, disconnectTelegram);

module.exports = router;
