const { getEnvironmentVariable } = require('@langchain/core/utils/env');
const fetch = require('node-fetch');
const { logger } = require('@librechat/data-schemas');

/**
 * Send reply email via Postmark.
 * @param {Object} params
 * @param {string} params.to - Recipient email (From address of inbound)
 * @param {string} params.subject - Subject line (e.g. Re: original subject)
 * @param {string} params.body - Plain text body
 * @param {string} [params.replyTo] - Reply-To header for correct threading
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendInboundReply({ to, subject, body, replyTo }) {
  const apiKey = getEnvironmentVariable('POSTMARK_API_KEY');

  if (!apiKey) {
    logger.error('[sendInboundReply] No Postmark API key configured');
    return { success: false, error: 'Postmark not configured' };
  }

  const fromAddress =
    getEnvironmentVariable('POSTMARK_FROM') ||
    getEnvironmentVariable('EMAIL_FROM') ||
    'noreply@example.com';

  const payload = {
    From: fromAddress,
    To: to,
    Subject: subject,
    TextBody: body,
  };

  if (replyTo) {
    payload.ReplyTo = replyTo;
  }

  try {
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': apiKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      logger.error('[sendInboundReply] Postmark API error:', data);
      return {
        success: false,
        error: data.Message || `Postmark API failed (${res.status})`,
      };
    }

    return { success: true, messageId: data.MessageID };
  } catch (err) {
    logger.error('[sendInboundReply] Error sending email:', err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendInboundReply,
};
