/**
 * Rate limiter for inbound Telegram webhook.
 * Always returns 200 when limit exceeded (so Telegram does not retry).
 */
const rateLimit = require('express-rate-limit');
const { limiterCache } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { removePorts } = require('~/server/utils');

const {
  INBOUND_TELEGRAM_IP_MAX = 200,
  INBOUND_TELEGRAM_IP_WINDOW = 1,
} = process.env;

const windowMs = INBOUND_TELEGRAM_IP_WINDOW * 60 * 1000;
const max = parseInt(INBOUND_TELEGRAM_IP_MAX, 10) || 200;

const handler = (req, res) => {
  logger.warn('[InboundTelegram] Rate limit exceeded', { ip: removePorts(req) });
  res.status(200).send('');
};

const limiterOptions = {
  windowMs,
  max,
  handler,
  keyGenerator: removePorts,
  store: limiterCache('inbound_telegram_limiter'),
};

const inboundTelegramLimiter = rateLimit(limiterOptions);

module.exports = inboundTelegramLimiter;
