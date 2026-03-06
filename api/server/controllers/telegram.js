/**
 * Telegram connect, disconnect, and status endpoints.
 * User-scoped: links chatId to userId.
 */
const { logger } = require('@librechat/data-schemas');
const {
  createTelegramConnectToken,
  buildTelegramConnectUrl,
} = require('~/server/utils/telegramConnectToken');
const { TelegramLink } = require('~/db/models');
const { getAppConfig } = require('~/server/services/Config');
const { EModelEndpoint } = require('librechat-data-provider');

/**
 * POST /api/telegram/connect
 * Generate one-time token and return connect URL. Requires auth.
 */
async function connectTelegram(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const appConfig = await getAppConfig();
    const agentsConfig = appConfig?.endpoints?.[EModelEndpoint.agents];
    const botUsername = agentsConfig?.telegramBotUsername;
    const enabled = agentsConfig?.inboundTelegramEnabled;

    if (!enabled) {
      return res.status(403).json({ message: 'Telegram inbound is not enabled' });
    }

    if (!botUsername || !String(botUsername).trim()) {
      return res.status(400).json({ message: 'Telegram bot username not configured' });
    }

    const token = await createTelegramConnectToken(userId);
    const connectUrl = buildTelegramConnectUrl(token, botUsername);

    return res.json({ connectUrl });
  } catch (err) {
    logger.error('[Telegram Connect] Error:', err);
    return res.status(500).json({ message: 'Failed to generate connect link' });
  }
}

/**
 * GET /api/telegram/status
 * Check if current user has a Telegram link.
 */
async function getTelegramStatus(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const appConfig = await getAppConfig();
    const agentsConfig = appConfig?.endpoints?.[EModelEndpoint.agents];
    const enabled = agentsConfig?.inboundTelegramEnabled;

    if (!enabled) {
      return res.json({ connected: false, enabled: false });
    }

    const link = await TelegramLink.findOne({ userId }).select('chatId createdAt').lean();
    return res.json({
      connected: !!link,
      enabled: true,
      ...(link && { linkedAt: link.createdAt }),
    });
  } catch (err) {
    logger.error('[Telegram Status] Error:', err);
    return res.status(500).json({ message: 'Failed to get status' });
  }
}

/**
 * DELETE /api/telegram/disconnect
 * Remove user's Telegram link.
 */
async function disconnectTelegram(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const result = await TelegramLink.deleteMany({ userId });
    if (result.deletedCount === 0) {
      return res.json({ disconnected: false, message: 'No Telegram link found' });
    }

    return res.json({ disconnected: true });
  } catch (err) {
    logger.error('[Telegram Disconnect] Error:', err);
    return res.status(500).json({ message: 'Failed to disconnect' });
  }
}

module.exports = {
  connectTelegram,
  getTelegramStatus,
  disconnectTelegram,
};
