const { getEnvironmentVariable } = require('@langchain/core/utils/env');
const fetch = require('node-fetch');
const { logger } = require('@librechat/data-schemas');
const { logEmailSent } = require('~/server/services/EventLogService');

/**
 * Send reply email via Postmark.
 * @param {Object} params
 * @param {string} params.to - Recipient email (From address of inbound)
 * @param {string} params.subject - Subject line (e.g. Re: original subject)
 * @param {string} params.body - Plain text body (TextBody)
 * @param {string} [params.html] - HTML body (HtmlBody); when provided, both HtmlBody and TextBody are sent
 * @param {string} [params.replyTo] - Reply-To header for correct threading
 * @param {Object} [params.auditContext] - Optional audit context for EventLog
 * @param {string} [params.auditContext.userId]
 * @param {string} [params.auditContext.agentId]
 * @param {string} [params.auditContext.agentName]
 * @param {string} [params.auditContext.conversationId]
 * @param {string} [params.auditContext.runId]
 * @param {string} [params.auditContext.scheduleId]
 * @param {string} [params.auditContext.scheduleName]
 * @param {string} [params.auditContext.toolCallId]
 * @param {string} [params.auditContext.toolName]
 * @param {string} [params.auditContext.source]
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendInboundReply({ to, subject, body, html, replyTo, auditContext }) {
  const apiKey = getEnvironmentVariable('POSTMARK_API_KEY');

  if (!apiKey) {
    logger.error('[sendInboundReply] No Postmark API key configured');
    logger.info('[sendInboundReply] Set POSTMARK_API_KEY to enable reply emails');
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

  if (html) {
    payload.HtmlBody = html;
  }

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

    logger.info('[sendInboundReply] Sent successfully', {
      to,
      messageId: data.MessageID,
    });

    if (auditContext?.userId) {
      await logEmailSent({
        userId: auditContext.userId,
        to,
        subject,
        provider: 'postmark',
        metadata: {
          messageId: data.MessageID,
          agentId: auditContext.agentId,
          agentName: auditContext.agentName,
          conversationId: auditContext.conversationId,
          runId: auditContext.runId,
          scheduleId: auditContext.scheduleId,
          scheduleName: auditContext.scheduleName,
          toolCallId: auditContext.toolCallId,
          toolName: auditContext.toolName,
          source: auditContext.source,
        },
        success: true,
      });
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
