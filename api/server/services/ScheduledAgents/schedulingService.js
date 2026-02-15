/**
 * Scheduling service - reusable business logic for scheduled agents.
 * Used by both HTTP controllers and agent tools.
 */
const mongoose = require('mongoose');
const { v4 } = require('uuid');
const dbModels = require('~/db/models');
const { getConvo } = require('~/models/Conversation');
const { getMessages } = require('~/models/Message');

const ScheduledAgent = dbModels.ScheduledAgent ?? (mongoose.models && mongoose.models.ScheduledAgent);
const ScheduledRun = dbModels.ScheduledRun ?? (mongoose.models && mongoose.models.ScheduledRun);

/**
 * Compute next run time for a schedule.
 * @param {Object} schedule - Schedule document (recurring or one-off)
 * @returns {{ nextRunAt: string | null }}
 */
function computeNextRunAt(schedule) {
  if (!schedule || !schedule.enabled) {
    return { nextRunAt: null };
  }
  const timezone = schedule.timezone || 'UTC';
  const now = new Date();

  if (schedule.scheduleType === 'one-off') {
    const runAt = schedule.runAt ? new Date(schedule.runAt) : null;
    if (!runAt || runAt <= now) {
      return { nextRunAt: null };
    }
    return { nextRunAt: runAt.toISOString() };
  }

  if (schedule.scheduleType === 'recurring' && schedule.cronExpression) {
    try {
      const cronParser = require('cron-parser');
      const interval = cronParser.parseExpression(schedule.cronExpression, {
        currentDate: now,
        tz: timezone,
      });
      const next = interval.next().toDate();
      return { nextRunAt: next.toISOString() };
    } catch {
      return { nextRunAt: null };
    }
  }

  return { nextRunAt: null };
}

/**
 * @param {string} userId - User ID (string)
 * @returns {Promise<Object[]>} List of schedules with nextRunAt
 */
async function listSchedulesForUser(userId) {
  const schedules = await ScheduledAgent.find({ userId })
    .sort({ createdAt: -1 })
    .lean();
  return schedules.map((s) => ({ ...s, ...computeNextRunAt(s) }));
}

/**
 * @param {string} userId - User ID
 * @param {Object} data - Schedule data
 * @param {string} data.name
 * @param {string} data.agentId
 * @param {string} data.prompt
 * @param {string} data.scheduleType - 'recurring' | 'one-off'
 * @param {string} [data.cronExpression] - Required if recurring
 * @param {string|Date} [data.runAt] - Required if one-off
 * @param {string} [data.timezone]
 * @param {string[]|null} [data.selectedTools]
 * @returns {Promise<Object>} Created schedule
 */
async function createScheduleForUser(userId, data) {
  const { name, agentId, prompt, scheduleType, cronExpression, runAt, timezone, selectedTools } = data;

  const schedule = await ScheduledAgent.create({
    userId,
    agentId,
    name,
    prompt,
    scheduleType,
    cronExpression: scheduleType === 'recurring' ? cronExpression : null,
    runAt: scheduleType === 'one-off' ? new Date(runAt) : null,
    enabled: true,
    timezone: timezone || 'UTC',
    ...(selectedTools !== undefined && { selectedTools }),
  });

  return typeof schedule.toObject === 'function' ? schedule.toObject() : schedule;
}

/**
 * @param {string} userId - User ID
 * @param {string} scheduleId - Schedule ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object|null>} Updated schedule or null if not found
 */
async function updateScheduleForUser(userId, scheduleId, updates) {
  const schedule = await ScheduledAgent.findOne({
    _id: scheduleId,
    userId,
  });

  if (!schedule) {
    return null;
  }

  const { name, agentId, prompt, scheduleType, cronExpression, runAt, enabled, timezone, selectedTools } =
    updates;

  const effectiveScheduleType = scheduleType ?? schedule.scheduleType;

  if (name != null) schedule.name = name;
  if (agentId != null) schedule.agentId = agentId;
  if (prompt != null) schedule.prompt = prompt;
  if (scheduleType != null) schedule.scheduleType = scheduleType;
  if (cronExpression != null) schedule.cronExpression = effectiveScheduleType === 'recurring' ? cronExpression : null;
  if (runAt != null) schedule.runAt = effectiveScheduleType === 'one-off' ? new Date(runAt) : null;
  if (enabled != null) schedule.enabled = enabled;
  if (timezone != null) schedule.timezone = timezone;
  if (selectedTools !== undefined) schedule.selectedTools = selectedTools;

  await schedule.save();
  return typeof schedule.toObject === 'function' ? schedule.toObject() : schedule;
}

/**
 * @param {string} userId - User ID
 * @param {string} scheduleId - Schedule ID
 * @returns {Promise<boolean>} True if deleted
 */
async function deleteScheduleForUser(userId, scheduleId) {
  const result = await ScheduledAgent.findOneAndDelete({
    _id: scheduleId,
    userId,
  });
  return !!result;
}

/**
 * @param {string} userId - User ID
 * @param {string} scheduleId - Schedule ID
 * @returns {Promise<{ success: boolean; runId?: string; status?: string; conversationId?: string; error?: string }>}
 */
async function runScheduleForUser(userId, scheduleId) {
  const schedule = await ScheduledAgent.findOne({
    _id: scheduleId,
    userId,
  }).lean();

  if (!schedule) {
    return { success: false, error: 'Schedule not found' };
  }

  const conversationId = v4();
  const runAt = new Date();

  const run = await ScheduledRun.create({
    scheduleId: schedule._id,
    userId: schedule.userId,
    conversationId,
    runAt,
    status: 'queued',
  });
  const runId = run._id.toString();

  const { enqueueRun, isQueueAvailable } = require('./jobQueue');
  const { executeScheduledAgent } = require('./executeAgent');

  const payload = {
    scheduleId: schedule._id.toString(),
    userId: schedule.userId.toString(),
    agentId: schedule.agentId,
    prompt: schedule.prompt,
    conversationId,
    selectedTools: schedule.selectedTools,
  };

  if (isQueueAvailable()) {
    await enqueueRun(runId, payload);
  } else {
    const { logger } = require('@librechat/data-schemas');
    logger.warn(
      '[ScheduledAgents] Redis not available; running in background. Jobs may be lost on restart.',
    );
    setImmediate(() => {
      executeScheduledAgent({ runId, ...payload }).catch((err) => {
        logger.error('[ScheduledAgents] Background run failed:', err);
      });
    });
  }

  return {
    success: true,
    runId,
    status: 'queued',
    conversationId,
  };
}

/**
 * @param {string} userId - User ID
 * @param {Object} [opts]
 * @param {number} [opts.limit]
 * @returns {Promise<Object[]>} List of runs
 */
async function listRunsForUser(userId, opts = {}) {
  const limit = Math.min(parseInt(opts.limit, 10) || 25, 100);
  const runs = await ScheduledRun.find({ userId })
    .populate('scheduleId', 'name agentId')
    .sort({ runAt: -1 })
    .limit(limit)
    .lean();
  return runs;
}

/**
 * @param {string} userId - User ID
 * @param {string} runId - Run ID
 * @returns {Promise<Object|null>} Run with conversation and messages, or null
 */
async function getRunForUser(userId, runId) {
  const run = await ScheduledRun.findOne({
    _id: runId,
    userId,
  })
    .populate('scheduleId', 'name agentId')
    .lean();

  if (!run) {
    return null;
  }

  const convo = await getConvo(userId, run.conversationId);
  if (!convo) {
    return {
      ...run,
      conversation: null,
      messages: [],
    };
  }

  const messages = await getMessages({ conversationId: run.conversationId, user: userId });

  return {
    ...run,
    conversation: convo,
    messages: messages || [],
  };
}

module.exports = {
  listSchedulesForUser,
  createScheduleForUser,
  updateScheduleForUser,
  deleteScheduleForUser,
  runScheduleForUser,
  listRunsForUser,
  getRunForUser,
};
