/**
 * Send reply via Telegram Bot API.
 * @param {Object} params
 * @param {string|number} params.chatId - Telegram chat ID
 * @param {string} params.text - Message text (plain text)
 * @param {number} [params.replyToMessageId] - Optional message ID to reply to
 * @param {Object} [params.reply_markup] - Optional inline keyboard (e.g. { inline_keyboard: [[{ text, url }]] })
 * @param {string} [params.parse_mode] - Optional parse mode: 'Markdown' or 'HTML' for link formatting
 * @returns {Promise<{success: boolean, messageId?: number, error?: string}>}
 */
const { getEnvironmentVariable } = require('@langchain/core/utils/env');
const fetch = require('node-fetch');
const { logger } = require('@librechat/data-schemas');

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

async function sendTelegramReply({ chatId, text, replyToMessageId, reply_markup, parse_mode }) {
  const token = getEnvironmentVariable('TELEGRAM_BOT_TOKEN');

  if (!token) {
    logger.error('[sendTelegramReply] No TELEGRAM_BOT_TOKEN configured');
    return { success: false, error: 'Telegram not configured' };
  }

  if (!text || typeof text !== 'string') {
    return { success: false, error: 'Empty or invalid text' };
  }

  // Telegram has 4096 char limit; truncate if needed
  let messageText = text;
  if (messageText.length > TELEGRAM_MAX_MESSAGE_LENGTH) {
    messageText = messageText.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH - 3) + '...';
  }

  const payload = {
    chat_id: chatId,
    text: messageText,
    parse_mode: parse_mode ?? undefined,
    disable_web_page_preview: true,
  };

  if (replyToMessageId != null) {
    payload.reply_to_message_id = replyToMessageId;
  }

  if (reply_markup != null) {
    payload.reply_markup = reply_markup;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      const errMsg = data?.description || data?.error_description || `Telegram API failed (${res.status})`;
      logger.error('[sendTelegramReply] Telegram API error:', {
        status: res.status,
        description: errMsg,
        ok: data?.ok,
        error_code: data?.error_code,
      });
      return {
        success: false,
        error: errMsg,
      };
    }

    logger.debug('[sendTelegramReply] Sent successfully', {
      chatId,
      messageId: data.result?.message_id,
    });

    return {
      success: true,
      messageId: data.result?.message_id,
    };
  } catch (err) {
    logger.error('[sendTelegramReply] Error:', err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendTelegramReply,
};
