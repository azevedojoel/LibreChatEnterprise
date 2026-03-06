/**
 * One-time tokens for Telegram connect flow. Links chatId to userId.
 */
const crypto = require('crypto');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');

const CONNECT_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Creates a single-use, short-lived token for Telegram connect.
 * Token is bound to userId.
 *
 * @param {string} userId - LibreChat user ID
 * @returns {Promise<string>} Plain token to include in t.me/Bot?start=token
 */
async function createTelegramConnectToken(userId) {
  const plainToken = crypto.randomBytes(32).toString('base64url');
  const cache = getLogStores(CacheKeys.TELEGRAM_CONNECT_TOKENS);
  const payload = {
    userId,
    createdAt: Date.now(),
  };
  await cache.set(plainToken, payload, CONNECT_TTL_MS);
  logger.debug('[Telegram Connect] Token created', { userId, tokenPreview: `${plainToken.slice(0, 8)}...` });
  return plainToken;
}

/**
 * Consumes a connect token (single-use). Validates and returns payload, then deletes.
 *
 * @param {string} token - Plain token from /start parameter
 * @returns {Promise<{ userId: string } | null>} Payload if valid
 */
async function consumeTelegramConnectToken(token) {
  if (!token || typeof token !== 'string' || !token.trim()) {
    return null;
  }
  const cache = getLogStores(CacheKeys.TELEGRAM_CONNECT_TOKENS);
  const payload = await cache.get(token);
  if (!payload) {
    logger.warn('[Telegram Connect] Token not found or expired', {
      tokenPreview: `${String(token).slice(0, 8)}...`,
    });
    return null;
  }
  const now = Date.now();
  const age = now - (payload.createdAt || 0);
  if (age > CONNECT_TTL_MS) {
    logger.warn('[Telegram Connect] Token expired', { ageMs: age });
    await cache.delete(token);
    return null;
  }
  await cache.delete(token);
  return {
    userId: payload.userId,
  };
}

/**
 * Builds the Telegram deep link URL for connect.
 *
 * @param {string} token - Plain connect token
 * @param {string} botUsername - Bot username (e.g. DailyThreadBot)
 * @returns {string} Full URL: https://t.me/BotUsername?start=token
 */
function buildTelegramConnectUrl(token, botUsername) {
  const username = (botUsername || '').replace(/^@/, '');
  if (!username) {
    return `https://t.me/YourBot?start=${token}`;
  }
  return `https://t.me/${username}?start=${token}`;
}

module.exports = {
  createTelegramConnectToken,
  consumeTelegramConnectToken,
  buildTelegramConnectUrl,
};
