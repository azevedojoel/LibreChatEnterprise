const { EventLog } = require('~/db/models');
const { logger } = require('@librechat/data-schemas');

/** Escape regex special chars for literal substring match */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Log an email sent event to the EventLog collection for auditing.
 * @param {Object} params
 * @param {string} params.userId - User ID (ObjectId or string) of the actor/recipient
 * @param {string} params.to - Recipient email address
 * @param {string} params.subject - Email subject
 * @param {Object} [params.metadata={}] - Additional audit metadata
 * @param {string} [params.metadata.agentId]
 * @param {string} [params.metadata.agentName]
 * @param {string} [params.metadata.conversationId]
 * @param {string} [params.metadata.runId]
 * @param {string} [params.metadata.scheduleId]
 * @param {string} [params.metadata.scheduleName]
 * @param {string} [params.metadata.toolCallId]
 * @param {string} [params.metadata.toolName]
 * @param {string} [params.metadata.source]
 * @param {string} [params.metadata.messageId]
 * @param {string} [params.metadata.errorMessage] - Error message when success is false (capped at 512 chars)
 * @param {string} [params.provider='smtp'] - 'mailgun' | 'smtp' | 'postmark'
 * @param {boolean} [params.success=true]
 */
async function logEmailSent({
  userId,
  to,
  subject,
  metadata = {},
  provider = 'smtp',
  success = true,
}) {
  if (!userId) {
    logger.warn('[EventLogService.logEmailSent] userId required, skipping audit');
    return;
  }

  try {
    await EventLog.create({
      type: 'email',
      event: 'email_sent',
      userId,
      metadata: {
        to,
        subject,
        provider,
        success,
        messageId: metadata.messageId,
        agentId: metadata.agentId,
        agentName: metadata.agentName,
        conversationId: metadata.conversationId,
        runId: metadata.runId,
        scheduleId: metadata.scheduleId,
        scheduleName: metadata.scheduleName,
        toolCallId: metadata.toolCallId,
        toolName: metadata.toolName,
        source: metadata.source,
        errorMessage: metadata.errorMessage
          ? String(metadata.errorMessage).slice(0, 512)
          : undefined,
      },
    });
  } catch (err) {
    logger.error('[EventLogService.logEmailSent] Failed to persist audit:', err);
  }
}

/**
 * Log a tool call failure to the EventLog collection for auditing.
 * @param {Object} params
 * @param {string} params.userId - User ID (ObjectId or string) of the actor
 * @param {string} params.toolName - Name of the tool that failed
 * @param {string} [params.toolCallId] - Tool call ID
 * @param {string} [params.errorMessage] - Error message (capped at 512 chars)
 * @param {Object} [params.metadata={}] - Additional audit metadata
 * @param {string} [params.metadata.conversationId]
 * @param {string} [params.metadata.agentId]
 * @param {string} [params.metadata.runId]
 * @param {string} [params.metadata.scheduleId]
 */
async function logToolCallFailure({
  userId,
  toolName,
  toolCallId,
  errorMessage,
  metadata = {},
}) {
  if (!userId) {
    logger.warn('[EventLogService.logToolCallFailure] userId required, skipping audit');
    return;
  }
  try {
    await EventLog.create({
      type: 'tool',
      event: 'tool_call_failed',
      userId,
      metadata: {
        toolName,
        toolCallId,
        errorMessage: (errorMessage || '').slice(0, 512),
        success: false,
        conversationId: metadata.conversationId,
        agentId: metadata.agentId,
        runId: metadata.runId,
        scheduleId: metadata.scheduleId,
        ...metadata,
      },
    });
  } catch (err) {
    logger.error('[EventLogService.logToolCallFailure] Failed to persist audit:', err);
  }
}

/**
 * Search EventLog with filters. Read-only; used by Sys Admin.
 * @param {Object} params
 * @param {string} [params.type] - Event type (e.g. email)
 * @param {string} [params.event] - Event name (e.g. email_sent)
 * @param {string} [params.userId] - Filter by user
 * @param {string} [params.conversationId] - metadata.conversationId
 * @param {string} [params.agentId] - metadata.agentId
 * @param {string} [params.scheduleId] - metadata.scheduleId
 * @param {string} [params.to] - Substring match on metadata.to
 * @param {string} [params.subject] - Substring match on metadata.subject
 * @param {string} [params.source] - Exact match on metadata.source
 * @param {boolean} [params.success] - metadata.success
 * @param {string} [params.startDate] - createdAt >=
 * @param {string} [params.endDate] - createdAt <=
 * @param {string} [params.search] - Substring across to, subject, source
 * @param {number} [params.limit=50] - 1-200
 * @param {number} [params.skip=0] - Offset
 * @returns {Promise<{ events: Array, total: number, limit: number, skip: number }>}
 */
async function searchEventLogs({
  type,
  event,
  userId,
  conversationId,
  agentId,
  scheduleId,
  to,
  subject,
  source,
  success,
  startDate,
  endDate,
  search,
  limit = 50,
  skip = 0,
} = {}) {
  const filter = {};

  if (type && String(type).trim()) filter.type = String(type).trim();
  if (event && String(event).trim()) filter.event = String(event).trim();
  if (userId && String(userId).trim()) filter.userId = userId;
  if (conversationId && String(conversationId).trim()) {
    filter['metadata.conversationId'] = String(conversationId).trim();
  }
  if (agentId && String(agentId).trim()) filter['metadata.agentId'] = String(agentId).trim();
  if (scheduleId && String(scheduleId).trim()) filter['metadata.scheduleId'] = String(scheduleId).trim();
  if (typeof success === 'boolean') filter['metadata.success'] = success;
  if (source && String(source).trim()) filter['metadata.source'] = String(source).trim();

  if (to && String(to).trim()) {
    filter['metadata.to'] = { $regex: escapeRegex(String(to).trim()), $options: 'i' };
  }
  if (subject && String(subject).trim()) {
    filter['metadata.subject'] = { $regex: escapeRegex(String(subject).trim()), $options: 'i' };
  }

  if (search && String(search).trim()) {
    const s = escapeRegex(String(search).trim());
    const re = { $regex: s, $options: 'i' };
    filter.$or = [
      { 'metadata.to': re },
      { 'metadata.subject': re },
      { 'metadata.source': re },
    ];
  }

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const skipNum = Math.max(0, parseInt(skip, 10) || 0);

  const [events, total] = await Promise.all([
    EventLog.find(filter).sort({ createdAt: -1 }).skip(skipNum).limit(limitNum).lean(),
    EventLog.countDocuments(filter),
  ]);

  return { events, total, limit: limitNum, skip: skipNum };
}

module.exports = {
  logEmailSent,
  logToolCallFailure,
  searchEventLogs,
};
