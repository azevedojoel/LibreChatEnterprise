const { Notification } = require('~/db/models');
const { logger } = require('@librechat/data-schemas');

/**
 * Creates a notification for a user.
 * @param {Object} params
 * @param {string} params.userId - Target user ID
 * @param {string} params.type - 'workspace_message' | 'tool_approval' | 'human_notify' | 'scheduled_run_complete'
 * @param {string} params.title - Notification title
 * @param {string} params.body - Notification body
 * @param {string} [params.link] - Optional link (e.g. /c/conv-123)
 * @param {Object} [params.metadata] - Optional extra context
 * @returns {Promise<Object>} Created notification document
 */
async function createNotification({ userId, type, title, body, link, metadata }) {
  try {
    const doc = await Notification.create({
      userId,
      type,
      title,
      body,
      link: link || undefined,
      metadata: metadata || {},
    });
    return doc.toObject();
  } catch (error) {
    logger.error('NotificationService.createNotification failed:', error);
    throw error;
  }
}

module.exports = { createNotification };
