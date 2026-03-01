const { logger } = require('@librechat/data-schemas');
const { generateCheckAccess } = require('@librechat/api');
const { PermissionTypes, Permissions, ResourceType, PermissionBits } = require('librechat-data-provider');
const { getRoleByName } = require('~/models/Role');
const { getAgent } = require('~/models/Agent');
const { checkPermission } = require('~/server/services/PermissionService');
const {
  listSchedulesForUser,
  createScheduleForUser,
  updateScheduleForUser,
  deleteScheduleForUser,
  runScheduleForUser,
  listRunsForUser,
  getRunForUser,
} = require('~/server/services/ScheduledAgents/schedulingService');
const { removeRun } = require('~/server/services/ScheduledAgents/jobQueue');
const abortRegistry = require('~/server/services/ScheduledAgents/abortRegistry');
const { ScheduledRun } = require('~/db/models');
const { getPromptGroup } = require('~/models/Prompt');
/**
 * Verify user has VIEW permission on the agent before creating/updating a schedule.
 * @returns {{ ok: boolean; status?: number; message?: string }}
 */
async function ensureUserCanUseAgent(userId, role, agentId) {
  const agent = await getAgent({ id: agentId });
  if (!agent) return { ok: false, status: 404, message: 'Agent not found' };
  const hasAccess = await checkPermission({
    userId,
    role,
    resourceType: ResourceType.AGENT,
    resourceId: agent._id,
    requiredPermission: PermissionBits.VIEW,
  });
  return hasAccess ? { ok: true } : { ok: false, status: 403, message: 'Insufficient permissions to use this agent' };
}

/**
 * Verify user has VIEW permission on the prompt group before creating/updating a schedule.
 * @returns {{ ok: boolean; status?: number; message?: string }}
 */
async function ensureUserCanUsePromptGroup(userId, role, promptGroupId) {
  const group = await getPromptGroup({ _id: promptGroupId });
  if (!group) return { ok: false, status: 404, message: 'Prompt group not found' };
  const hasAccess = await checkPermission({
    userId,
    role,
    resourceType: ResourceType.PROMPTGROUP,
    resourceId: group._id,
    requiredPermission: PermissionBits.VIEW,
  });
  return hasAccess ? { ok: true } : { ok: false, status: 403, message: 'Insufficient permissions to use this prompt group' };
}

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
    const opts = req.query.promptGroupId ? { promptGroupId: req.query.promptGroupId } : {};
    const schedules = await listSchedulesForUser(req.user.id, opts);
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
    const { name, agentId, promptGroupId, scheduleType, cronExpression, runAt, timezone, selectedTools, emailOnComplete } =
      req.body;

    if (!name || !agentId || !promptGroupId || !scheduleType) {
      return res.status(400).json({ error: 'Missing required fields: name, agentId, promptGroupId, scheduleType' });
    }

    if (scheduleType === 'recurring' && !cronExpression) {
      return res.status(400).json({ error: 'cronExpression required for recurring schedules' });
    }

    if (scheduleType === 'one-off' && !runAt) {
      return res.status(400).json({ error: 'runAt required for one-off schedules' });
    }

    const agentCheck = await ensureUserCanUseAgent(req.user.id, req.user.role, agentId);
    if (!agentCheck.ok) {
      return res.status(agentCheck.status).json({ error: agentCheck.message });
    }

    const promptGroupCheck = await ensureUserCanUsePromptGroup(req.user.id, req.user.role, promptGroupId);
    if (!promptGroupCheck.ok) {
      return res.status(promptGroupCheck.status).json({ error: promptGroupCheck.message });
    }

    const schedule = await createScheduleForUser(req.user.id, {
      name,
      agentId,
      promptGroupId,
      scheduleType,
      cronExpression,
      runAt,
      timezone,
      selectedTools,
      emailOnComplete,
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
    if (req.body.agentId) {
      const agentCheck = await ensureUserCanUseAgent(req.user.id, req.user.role, req.body.agentId);
      if (!agentCheck.ok) {
        return res.status(agentCheck.status).json({ error: agentCheck.message });
      }
    }

    if (req.body.promptGroupId) {
      const promptGroupCheck = await ensureUserCanUsePromptGroup(req.user.id, req.user.role, req.body.promptGroupId);
      if (!promptGroupCheck.ok) {
        return res.status(promptGroupCheck.status).json({ error: promptGroupCheck.message });
      }
    }

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
      res.json({
        success: true,
        runId: result.runId,
        status: result.status,
        conversationId: result.conversationId,
      });
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
    const opts = { limit: req.query.limit };
    if (req.query.scheduleId) {
      opts.scheduleId = req.query.scheduleId;
    } else if (req.query.promptGroupId) {
      opts.promptGroupId = req.query.promptGroupId;
    }
    const runs = await listRunsForUser(req.user.id, opts);
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

/**
 * Cancel a queued or running scheduled run
 * POST /api/scheduled-agents/runs/:id/cancel
 */
async function cancelRun(req, res) {
  try {
    const runId = req.params.id;
    const run = await getRunForUser(req.user.id, runId);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    if (run.status === 'success' || run.status === 'failed' || run.status === 'pending') {
      return res.status(204).send();
    }

    if (run.status === 'queued') {
      const result = await removeRun(runId);
      if (result.removed) {
        await ScheduledRun.findByIdAndUpdate(runId, {
          $set: { status: 'failed', error: 'Cancelled by user' },
        });
        return res.json({ success: true, cancelled: true });
      }
      if (result.error === 'Job is being processed') {
        const aborted = abortRegistry.abort(runId);
        return res.json({
          success: true,
          cancelled: aborted,
          ...(aborted ? {} : { message: 'Run is starting; it will stop once processing begins' }),
        });
      }
      return res.status(400).json({ error: result.error || 'Failed to cancel run' });
    }

    if (run.status === 'running') {
      const aborted = abortRegistry.abort(runId);
      return res.json({
        success: true,
        cancelled: aborted,
        ...(aborted ? {} : { message: 'Run not found in active workers; it may have completed' }),
      });
    }

    return res.status(400).json({ error: 'Cannot cancel run in current state' });
  } catch (error) {
    logger.error('[ScheduledAgents] cancelRun error:', error);
    res.status(500).json({ error: 'Failed to cancel run' });
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
  cancelRun,
};
