/**
 * Workflow scheduling service - create, update, delete, list schedules for workflows.
 * Reuses computeNextRunAt pattern from schedulingService.
 */
const { v4 } = require('uuid');
const dbModels = require('~/db/models');

const mongoose = require('mongoose');
const WorkflowSchedule = dbModels.WorkflowSchedule ?? mongoose.models?.WorkflowSchedule;
const WorkflowRun = dbModels.WorkflowRun ?? mongoose.models?.WorkflowRun;

/**
 * Compute next run time for a workflow schedule.
 * @param {Object} schedule - Schedule document
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
 * @param {string} userId - User ID
 * @param {string} workflowId - Filter by workflow ID
 * @returns {Promise<Object[]>} List of schedules with nextRunAt
 */
async function listSchedulesForWorkflow(userId, workflowId) {
  const query = { userId, workflowId };
  const schedules = await WorkflowSchedule.find(query).sort({ createdAt: -1 }).lean();
  return schedules.map((s) => ({ ...s, ...computeNextRunAt(s) }));
}

/**
 * @param {string} userId - User ID
 * @param {Object} data - Schedule data
 * @param {string} data.name
 * @param {string} data.workflowId
 * @param {string} data.scheduleType - 'recurring' | 'one-off'
 * @param {string} [data.cronExpression]
 * @param {string|Date} [data.runAt]
 * @param {string} [data.timezone]
 * @returns {Promise<Object>} Created schedule
 */
async function createScheduleForWorkflow(userId, data) {
  const { name, workflowId, scheduleType, cronExpression, runAt, timezone } = data;

  const schedule = await WorkflowSchedule.create({
    userId,
    workflowId,
    name,
    scheduleType,
    cronExpression: scheduleType === 'recurring' ? cronExpression : null,
    runAt: scheduleType === 'one-off' ? new Date(runAt) : null,
    enabled: true,
    timezone: timezone || 'UTC',
  });

  return typeof schedule.toObject === 'function' ? schedule.toObject() : schedule;
}

/**
 * @param {string} userId - User ID
 * @param {string} scheduleId - Schedule ID
 * @param {Object} updates - Fields to update
 * @param {string} [workflowId] - Optional workflow ID to ensure schedule belongs to workflow
 * @returns {Promise<Object|null>} Updated schedule or null
 */
async function updateScheduleForWorkflow(userId, scheduleId, updates, workflowId) {
  const query = { _id: scheduleId, userId };
  if (workflowId) query.workflowId = workflowId;
  const schedule = await WorkflowSchedule.findOne(query);

  if (!schedule) {
    return null;
  }

  const { name, scheduleType, cronExpression, runAt, enabled, timezone } = updates;
  const effectiveScheduleType = scheduleType ?? schedule.scheduleType;

  if (name != null) schedule.name = name;
  if (scheduleType != null) schedule.scheduleType = scheduleType;
  if (cronExpression != null) schedule.cronExpression = effectiveScheduleType === 'recurring' ? cronExpression : null;
  if (runAt != null) schedule.runAt = effectiveScheduleType === 'one-off' ? new Date(runAt) : null;
  if (enabled != null) schedule.enabled = enabled;
  if (timezone != null) schedule.timezone = timezone;

  await schedule.save();
  return typeof schedule.toObject === 'function' ? schedule.toObject() : schedule;
}

/**
 * @param {string} userId - User ID
 * @param {string} scheduleId - Schedule ID
 * @param {string} [workflowId] - Optional workflow ID to ensure schedule belongs to workflow
 * @returns {Promise<boolean>} True if deleted
 */
async function deleteScheduleForWorkflow(userId, scheduleId, workflowId) {
  const query = { _id: scheduleId, userId };
  if (workflowId) query.workflowId = workflowId;
  const result = await WorkflowSchedule.findOneAndDelete(query);
  return !!result;
}

/**
 * @param {string} userId - User ID
 * @param {string} scheduleId - Schedule ID
 * @param {string} [workflowId] - Optional workflow ID to ensure schedule belongs to workflow
 * @returns {Promise<{ success: boolean; runId?: string; status?: string; conversationId?: string; error?: string }>}
 */
async function runScheduleForWorkflow(userId, scheduleId, workflowId) {
  const query = { _id: scheduleId, userId };
  if (workflowId) query.workflowId = workflowId;
  const schedule = await WorkflowSchedule.findOne(query).lean();

  if (!schedule) {
    return { success: false, error: 'Schedule not found' };
  }

  const conversationId = v4();
  const runAt = new Date();

  const run = await WorkflowRun.create({
    workflowId: schedule.workflowId,
    userId: schedule.userId,
    conversationId,
    runAt,
    status: 'queued',
  });
  const runId = run._id.toString();

  const { enqueueWorkflowRun, isQueueAvailable, runWorkflowSerialized } = require('./workflowJobQueue');

  const payload = {
    runId,
    workflowId: schedule.workflowId.toString(),
    userId: schedule.userId.toString(),
  };

  if (isQueueAvailable()) {
    await enqueueWorkflowRun(runId, payload);
  } else {
    const { logger } = require('@librechat/data-schemas');
    logger.warn(
      '[WorkflowScheduling] Redis not available; running in background. Jobs may be lost on restart.',
    );
    runWorkflowSerialized(runId, payload).catch(() => {});
  }

  return {
    success: true,
    runId,
    status: 'queued',
    conversationId,
  };
}

module.exports = {
  listSchedulesForWorkflow,
  createScheduleForWorkflow,
  updateScheduleForWorkflow,
  deleteScheduleForWorkflow,
  runScheduleForWorkflow,
  computeNextRunAt,
};
