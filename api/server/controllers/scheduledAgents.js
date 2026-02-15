const { logger } = require('@librechat/data-schemas');
const { generateCheckAccess } = require('@librechat/api');
const { PermissionTypes, Permissions } = require('librechat-data-provider');
const { getRoleByName } = require('~/models/Role');
const {
  listSchedulesForUser,
  createScheduleForUser,
  updateScheduleForUser,
  deleteScheduleForUser,
  runScheduleForUser,
  listRunsForUser,
  getRunForUser,
} = require('~/server/services/ScheduledAgents/schedulingService');

const checkAgentAccess = generateCheckAccess({
  permissionType: PermissionTypes.AGENTS,
  permissions: [Permissions.USE],
  getRoleByName,
});

/**
 * List schedules for the current user
 * GET /api/scheduled-agents
 */
async function listSchedules(req, res) {
  try {
    const schedules = await listSchedulesForUser(req.user.id);
    res.json(schedules);
  } catch (error) {
    logger.error('[ScheduledAgents] listSchedules error:', error);
    res.status(500).json({ error: 'Failed to list schedules' });
  }
}

/**
 * Create a new schedule
 * POST /api/scheduled-agents
 */
async function createSchedule(req, res) {
  try {
    const { name, agentId, prompt, scheduleType, cronExpression, runAt, timezone, selectedTools } =
      req.body;

    if (!name || !agentId || !prompt || !scheduleType) {
      return res.status(400).json({ error: 'Missing required fields: name, agentId, prompt, scheduleType' });
    }

    if (scheduleType === 'recurring' && !cronExpression) {
      return res.status(400).json({ error: 'cronExpression required for recurring schedules' });
    }

    if (scheduleType === 'one-off' && !runAt) {
      return res.status(400).json({ error: 'runAt required for one-off schedules' });
    }

    const schedule = await createScheduleForUser(req.user.id, {
      name,
      agentId,
      prompt,
      scheduleType,
      cronExpression,
      runAt,
      timezone,
      selectedTools,
    });

    res.status(201).json(schedule);
  } catch (error) {
    logger.error('[ScheduledAgents] createSchedule error:', error);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
}

/**
 * Update a schedule
 * PATCH /api/scheduled-agents/:id
 */
async function updateSchedule(req, res) {
  try {
    const schedule = await updateScheduleForUser(req.user.id, req.params.id, req.body);

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    res.json(schedule);
  } catch (error) {
    logger.error('[ScheduledAgents] updateSchedule error:', error);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
}

/**
 * Delete a schedule
 * DELETE /api/scheduled-agents/:id
 */
async function deleteSchedule(req, res) {
  try {
    const deleted = await deleteScheduleForUser(req.user.id, req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    res.status(204).end();
  } catch (error) {
    logger.error('[ScheduledAgents] deleteSchedule error:', error);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
}

/**
 * Trigger a schedule run manually
 * POST /api/scheduled-agents/:id/run
 */
async function runSchedule(req, res) {
  try {
    const result = await runScheduleForUser(req.user.id, req.params.id);

    if (!result.success && result.error === 'Schedule not found') {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    if (result.success) {
      res.json({ success: true, conversationId: result.conversationId });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    logger.error(
      `[ScheduledAgents] runSchedule error: scheduleId=${req.params.id} userId=${req.user?.id} ${error?.message || String(error)}`,
      { stack: error?.stack },
    );
    res.status(500).json({ error: error.message || 'Failed to run schedule' });
  }
}

/**
 * List runs for the current user
 * GET /api/scheduled-agents/runs
 */
async function listRuns(req, res) {
  try {
    const runs = await listRunsForUser(req.user.id, { limit: req.query.limit });
    res.json(runs);
  } catch (error) {
    logger.error('[ScheduledAgents] listRuns error:', error);
    res.status(500).json({ error: 'Failed to list runs' });
  }
}

/**
 * Get a single run with conversation and messages
 * GET /api/scheduled-agents/runs/:id
 */
async function getRun(req, res) {
  try {
    const run = await getRunForUser(req.user.id, req.params.id);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    res.json(run);
  } catch (error) {
    logger.error('[ScheduledAgents] getRun error:', error);
    res.status(500).json({ error: 'Failed to get run' });
  }
}

module.exports = {
  checkAgentAccess,
  listSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  runSchedule,
  listRuns,
  getRun,
};
