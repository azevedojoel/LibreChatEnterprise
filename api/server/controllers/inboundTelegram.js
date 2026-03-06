/**
 * Telegram inbound webhook handler.
 * Queues updates in Redis via BullMQ for async processing; falls back to sync when Redis unavailable.
 * Always returns 200 to Telegram.
 */
const { logger } = require('@librechat/data-schemas');
const { enqueueInboundTelegram } = require('~/server/services/InboundTelegram/jobQueue');
const { processInboundTelegram } = require('~/server/services/InboundTelegram/processInboundTelegram');

const SYNC_FALLBACK_TIMEOUT_MS = 14 * 60 * 1000; // 14 minutes

/**
 * Handle Telegram webhook.
 * POST /api/inbound/telegram/:pathSecret
 * Never returns 4xx/5xx - always 200 so Telegram does not retry.
 */
const handleInboundTelegram = async (req, res) => {
  logger.debug('[InboundTelegram] Request received', {
    path: req.path,
    method: req.method,
    hasBody: !!req.body,
  });

  const pathSecret = req.params.pathSecret;
  const expectedSecret = process.env.INBOUND_TELEGRAM_PATH_SECRET;

  if (!expectedSecret || pathSecret !== expectedSecret) {
    logger.warn('[InboundTelegram] Path secret mismatch or not configured', {
      path: req.path,
    });
    return res.status(200).send('');
  }

  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (webhookSecret) {
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    if (!secretHeader || secretHeader !== webhookSecret) {
      logger.warn('[InboundTelegram] Secret token mismatch');
      return res.status(200).send('');
    }
  }

  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    logger.error('[InboundTelegram] Invalid or missing body');
    return res.status(200).send('');
  }

  const job = await enqueueInboundTelegram(payload);
  if (!job) {
    logger.warn(
      '[InboundTelegram] Redis unavailable; processing synchronously (fallback).',
    );
    try {
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Sync fallback timed out')),
          SYNC_FALLBACK_TIMEOUT_MS,
        );
      });
      try {
        await Promise.race([processInboundTelegram(payload), timeoutPromise]);
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      logger.error('[InboundTelegram] Sync fallback failed', err);
    }
  }

  return res.status(200).send('');
};

module.exports = {
  handleInboundTelegram,
};
