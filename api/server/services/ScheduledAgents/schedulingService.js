/**
 * Scheduling service - reusable business logic for scheduled agents.
 * Used by both HTTP controllers and agent tools.
 */
const mongoose = require('mongoose');
const { v4 } = require('uuid');
const dbModels = require('~/db/models');
const { getConvo } = require('~/models/Conversation');
const { getMessages } = require('~/models/Message');

const ScheduledPrompt = dbModels.ScheduledPrompt ?? (mongoose.models && mongoose.models.ScheduledPrompt);
const ScheduledRun = dbModels.ScheduledRun ?? (mongoose.models && mongoose.models.ScheduledRun);

/** Max queued+running runs per schedule before skipping new triggers. Env: SCHEDULED_AGENTS_MAX_QUEUE_DEPTH */
const DEFAULT_MAX_QUEUE_DEPTH = 5;
/** Cooldown (ms) for run_schedule when schedule already has pending run. Env: SCHEDULED_AGENTS_RUN_COOLDOWN_MS */
const DEFAULT_RUN_COOLDOWN_MS = 30 * 1000;
/** Max schedules per user. Env: SCHEDULED_AGENTS_MAX_SCHEDULES_PER_USER */
const DEFAULT_MAX_SCHEDULES_PER_USER = 50;
/** Min cron interval (ms) when validation enabled. Env: SCHEDULED_AGENTS_MIN_CRON_INTERVAL_MS */
const DEFAULT_MIN_CRON_INTERVAL_MS = 5 * 60 * 1000;

function getMaxQueueDepth() {
  const raw = parseInt(process.env.SCHEDULED_AGENTS_MAX_QUEUE_DEPTH, 10);
  return Number.isNaN(raw) ? DEFAULT_MAX_QUEUE_DEPTH : Math.max(1, raw);
}

function getRunCooldownMs() {
  const raw = parseInt(process.env.SCHEDULED_AGENTS_RUN_COOLDOWN_MS, 10);
  return Number.isNaN(raw) ? DEFAULT_RUN_COOLDOWN_MS : Math.max(0, raw);
}

function getMaxSchedulesPerUser() {
  const raw = parseInt(process.env.SCHEDULED_AGENTS_MAX_SCHEDULES_PER_USER, 10);
  return Number.isNaN(raw) ? DEFAULT_MAX_SCHEDULES_PER_USER : Math.max(1, raw);
}

function getMinCronIntervalMs() {
  const raw = parseInt(process.env.SCHEDULED_AGENTS_MIN_CRON_INTERVAL_MS, 10);
  return Number.isNaN(raw) ? DEFAULT_MIN_CRON_INTERVAL_MS : Math.max(60 * 1000, raw);
}

function isCronFrequencyValidationEnabled() {
  return process.env.SCHEDULED_AGENTS_VALIDATE_CRON_FREQUENCY === 'true';
}

/**
 * Validate runAt for one-off schedules. Returns error message or null if valid.
 * @param {string|Date} runAt
 * @param {boolean} [isUpdate=false] - When true, skip "must be in the future" check.
 *   Allows editing existing schedules (e.g. to correct metadata). Note: a past runAt
 *   will never trigger a run; use for historical record-keeping only.
 * @returns {string|null}
 */
function validateRunAt(runAt, isUpdate = false) {
  if (runAt == null) return 'runAt is required for one-off schedules';
  const d = new Date(runAt);
  if (Number.isNaN(d.getTime())) return 'runAt must be a valid date (ISO string or date)';
  if (!isUpdate && d.getTime() <= Date.now()) return 'runAt must be in the future';
  return null;
}

/**
 * Validate cron frequency is not too aggressive. Returns error message or null if valid.
 * @param {string} cronExpression
 * @param {string} [timezone]
 * @returns {Promise<string|null>}
 */
async function validateCronFrequency(cronExpression, timezone = 'UTC') {
  if (!isCronFrequencyValidationEnabled() || !cronExpression) return null;
  try {
    const cronParser = require('cron-parser');
    const interval = cronParser.parseExpression(cronExpression, {
      currentDate: new Date(),
      tz: timezone,
    });
    const next1 = interval.next().toDate();
    const next2 = interval.next().toDate();
    const minIntervalMs = next2.getTime() - next1.getTime();
    if (minIntervalMs < getMinCronIntervalMs()) {
      return `Cron schedule is too frequent (min ${Math.round(getMinCronIntervalMs() / 60000)} min between runs). Use a less frequent schedule.`;
    }
  } catch {
    return null; // Let cron-parser fail elsewhere for invalid syntax
  }
  return null;
}

/**
 * Count pending (queued or running) runs for a schedule.
 * @param {string} scheduleId
 * @returns {Promise<number>}
 */
async function countPendingRunsForSchedule(scheduleId) {
  const count = await ScheduledRun.countDocuments({
    scheduleId: new mongoose.Types.ObjectId(scheduleId),
    status: { $in: ['queued', 'running'] },
  });
  return count;
}

/**
 * Get the most recent pending run's runAt for a schedule.
 * @param {string} scheduleId
 * @returns {Promise<Date|null>}
 */
async function getMostRecentPendingRunAt(scheduleId) {
  const run = await ScheduledRun.findOne(
    { scheduleId: new mongoose.Types.ObjectId(scheduleId), status: { $in: ['queued', 'running'] } },
    { runAt: 1 },
    { sort: { runAt: -1 } },
  ).lean();
  return run?.runAt ? new Date(run.runAt) : null;
}

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
 * @param {Object} [opts]
 * @param {string} [opts.promptGroupId] - Filter schedules by prompt group ID
 * @returns {Promise<Object[]>} List of schedules with nextRunAt
 */
async function listSchedulesForUser(userId, opts = {}) {
  const query = { userId };
  if (opts.promptGroupId) {
    query.promptGroupId = opts.promptGroupId;
  }
  const schedules = await ScheduledPrompt.find(query)
    .populate('promptGroupId', 'name command')
    .sort({ createdAt: -1 })
    .lean();
  return schedules.map((s) => ({ ...s, ...computeNextRunAt(s) }));
}

/**
 * @param {string} userId - User ID
 * @param {Object} data - Schedule data
 * @param {string} data.name
 * @param {string} data.agentId
 * @param {string} data.prompt - Free-text prompt (required for new schedules)
 * @param {string} data.scheduleType - 'recurring' | 'one-off'
 * @param {string} [data.cronExpression] - Required if recurring
 * @param {string|Date} [data.runAt] - Required if one-off
 * @param {string} [data.timezone]
 * @param {string[]|null} [data.selectedTools]
 * @param {string|null} [data.userProjectId]
 * @returns {Promise<Object>} Created schedule
 */
async function createScheduleForUser(userId, data) {
  const { name, agentId, prompt, scheduleType, cronExpression, runAt, timezone, selectedTools, emailOnComplete, userProjectId } =
    data;

  const existingCount = await ScheduledPrompt.countDocuments({ userId: new mongoose.Types.ObjectId(userId) });
  if (existingCount >= getMaxSchedulesPerUser()) {
    throw new Error(
      `Schedule limit reached (max ${getMaxSchedulesPerUser()} per user). Delete existing schedules before creating new ones.`,
    );
  }

  if (scheduleType === 'one-off') {
    const runAtError = validateRunAt(runAt);
    if (runAtError) throw new Error(runAtError);
  }

  if (scheduleType === 'recurring' && cronExpression) {
    const cronError = await validateCronFrequency(cronExpression, timezone || 'UTC');
    if (cronError) throw new Error(cronError);
  }

  const schedule = await ScheduledPrompt.create({
    userId,
    agentId,
    name,
    prompt: prompt != null ? String(prompt).trim() : null,
    scheduleType,
    cronExpression: scheduleType === 'recurring' ? cronExpression : null,
    runAt: scheduleType === 'one-off' ? new Date(runAt) : null,
    enabled: true,
    timezone: timezone || 'UTC',
    ...(selectedTools !== undefined && { selectedTools }),
    ...(emailOnComplete !== undefined && { emailOnComplete }),
    ...(userProjectId !== undefined && { userProjectId: userProjectId || null }),
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
  const schedule = await ScheduledPrompt.findOne({
    _id: scheduleId,
    userId,
  });

  if (!schedule) {
    return null;
  }

  const { name, agentId, prompt, scheduleType, cronExpression, runAt, enabled, timezone, selectedTools, emailOnComplete, userProjectId } =
    updates;

  const effectiveScheduleType = scheduleType ?? schedule.scheduleType;

  if (name != null) schedule.name = name;
  if (agentId != null) schedule.agentId = agentId;
  if (prompt !== undefined) {
    const trimmed = prompt != null ? String(prompt).trim() : '';
    if (trimmed === '') {
      throw new Error('Prompt cannot be empty');
    }
    schedule.prompt = trimmed;
  }
  if (scheduleType != null) schedule.scheduleType = scheduleType;
  if (cronExpression != null) {
    if (effectiveScheduleType === 'recurring') {
      const cronError = await validateCronFrequency(cronExpression, schedule.timezone || 'UTC');
      if (cronError) throw new Error(cronError);
      schedule.cronExpression = cronExpression;
    } else {
      schedule.cronExpression = null;
    }
  }
  if (runAt != null) {
    if (effectiveScheduleType === 'one-off') {
      const runAtError = validateRunAt(runAt, true);
      if (runAtError) throw new Error(runAtError);
      schedule.runAt = new Date(runAt);
    } else {
      schedule.runAt = null;
    }
  }
  if (enabled != null) schedule.enabled = enabled;
  if (timezone != null) schedule.timezone = timezone;
  if (selectedTools !== undefined) schedule.selectedTools = selectedTools;
  if (emailOnComplete !== undefined) schedule.emailOnComplete = emailOnComplete;
  if (userProjectId !== undefined) schedule.userProjectId = userProjectId || null;

  await schedule.save();
  return typeof schedule.toObject === 'function' ? schedule.toObject() : schedule;
}

/**
 * @param {string} userId - User ID
 * @param {string} scheduleId - Schedule ID
 * @returns {Promise<boolean>} True if deleted
 */
async function deleteScheduleForUser(userId, scheduleId) {
  const result = await ScheduledPrompt.findOneAndDelete({
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
  const isValidId =
    scheduleId &&
    typeof scheduleId === 'string' &&
    scheduleId.length === 24 &&
    /^[a-fA-F0-9]{24}$/.test(scheduleId);
  if (!isValidId) {
    return { success: false, error: 'Invalid schedule ID' };
  }

  const schedule = await ScheduledPrompt.findOne({
    _id: scheduleId,
    userId,
  }).lean();

  if (!schedule) {
    return { success: false, error: 'Schedule not found' };
  }

  const pendingCount = await countPendingRunsForSchedule(scheduleId);
  if (pendingCount >= getMaxQueueDepth()) {
    return {
      success: false,
      error: `Schedule has too many pending runs (${pendingCount}). Wait for some to complete before triggering again.`,
    };
  }

  const cooldownMs = getRunCooldownMs();
  if (cooldownMs > 0 && pendingCount > 0) {
    const mostRecent = await getMostRecentPendingRunAt(scheduleId);
    if (mostRecent && Date.now() - mostRecent.getTime() < cooldownMs) {
      return {
        success: false,
        error: `Please wait ${Math.ceil(cooldownMs / 1000)}s before triggering this schedule again (run already in progress).`,
      };
    }
  }

  const conversationId = v4();
  const runAt = new Date();

  const run = await ScheduledRun.create({
    scheduleId: schedule._id,
    userId: schedule.userId,
    conversationId,
    prompt: null,
    runAt,
    status: 'queued',
  });
  const runId = run._id.toString();

  const { enqueueRun, isQueueAvailable, runSerializedPerAgent } = require('./jobQueue');

  const payload = {
    scheduleId: schedule._id.toString(),
    userId: schedule.userId.toString(),
    agentId: schedule.agentId,
    conversationId,
    selectedTools: schedule.selectedTools,
    userProjectId: schedule.userProjectId?.toString?.() ?? schedule.userProjectId ?? null,
  };

  if (isQueueAvailable()) {
    await enqueueRun(runId, payload);
  } else {
    const { logger } = require('@librechat/data-schemas');
    logger.warn(
      '[ScheduledAgents] Redis not available; running in background. Jobs may be lost on restart.',
    );
    runSerializedPerAgent(runId, payload).catch(() => {});
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
 * @param {string} [opts.promptGroupId] - Filter runs by prompt group ID
 * @param {string} [opts.scheduleId] - Filter runs by schedule ID
 * @returns {Promise<Object[]>} List of runs
 */
async function listRunsForUser(userId, opts = {}) {
  const limit = Math.min(parseInt(opts.limit, 10) || 25, 100);
  const query = { userId };
  if (opts.scheduleId) {
    query.scheduleId = opts.scheduleId;
  } else if (opts.promptGroupId) {
    const scheduleIds = await ScheduledPrompt.find({
      userId,
      promptGroupId: opts.promptGroupId,
    })
      .distinct('_id');
    query.scheduleId = { $in: scheduleIds };
  }
  const runs = await ScheduledRun.find(query)
    .populate('scheduleId', 'name agentId prompt promptGroupId')
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
    .populate('scheduleId', 'name agentId prompt promptGroupId')
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
