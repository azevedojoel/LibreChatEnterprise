const { logger } = require('@librechat/data-schemas');
const { generateCheckAccess } = require('@librechat/api');
const {
  PermissionTypes,
  Permissions,
  ResourceType,
  PermissionBits,
  SystemRoles,
} = require('librechat-data-provider');
const { getRoleByName } = require('~/models/Role');
const { getAgent } = require('~/models/Agent');
const { checkPermission } = require('~/server/services/PermissionService');
const { getPromptGroup } = require('~/models/Prompt');
const { Workflow, WorkflowRun } = require('~/db/models');
const { executeWorkflow } = require('~/server/services/ScheduledAgents/executeWorkflow');
const {
  listSchedulesForWorkflow,
  createScheduleForWorkflow,
  updateScheduleForWorkflow,
  deleteScheduleForWorkflow,
  runScheduleForWorkflow,
} = require('~/server/services/ScheduledAgents/workflowSchedulingService');

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

const checkWorkflowAccess = generateCheckAccess({
  permissionType: PermissionTypes.PROMPTS,
  permissions: [Permissions.USE],
  getRoleByName,
});

const checkAgentAccess = generateCheckAccess({
  permissionType: PermissionTypes.AGENTS,
  permissions: [Permissions.USE],
  getRoleByName,
});

function getWorkflowFilter(req, id) {
  const filter = { _id: id };
  if (req.user.role !== SystemRoles.ADMIN) {
    filter.userId = req.user.id;
  }
  return filter;
}

async function listWorkflows(req, res) {
  try {
    const query = req.user.role === SystemRoles.ADMIN ? {} : { userId: req.user.id };
    const workflows = await Workflow.find(query)
      .sort({ updatedAt: -1 })
      .lean();
    res.json(workflows);
  } catch (error) {
    logger.error('[Workflows] listWorkflows error:', error);
    res.status(500).json({ error: 'Failed to list workflows' });
  }
}

async function getWorkflow(req, res) {
  try {
    const workflow = await Workflow.findOne(getWorkflowFilter(req, req.params.id)).lean();

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    res.json(workflow);
  } catch (error) {
    logger.error('[Workflows] getWorkflow error:', error);
    res.status(500).json({ error: 'Failed to get workflow' });
  }
}

async function createWorkflow(req, res) {
  try {
    const { name, nodes: rawNodes = [], edges = [] } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Missing required field: name' });
    }

    const nodes = rawNodes.map((n) => ({
      ...n,
      promptGroupId: n.promptGroupId && String(n.promptGroupId).trim() ? String(n.promptGroupId).trim() : null,
      agentId: n.agentId && String(n.agentId).trim() ? String(n.agentId).trim() : null,
      selectedTools:
        n.selectedTools !== undefined
          ? (Array.isArray(n.selectedTools) ? n.selectedTools : null)
          : undefined,
    }));

    const hasInvalidNode = nodes.some(
      (n) => !n.promptGroupId || !n.agentId,
    );
    if (nodes.length > 0 && hasInvalidNode) {
      return res.status(400).json({
        error: 'All workflow steps must have a prompt and agent selected',
      });
    }

    for (const node of nodes) {
      if (node.agentId && node.agentId.trim()) {
        const agentCheck = await ensureUserCanUseAgent(req.user.id, req.user.role, node.agentId);
        if (!agentCheck.ok) {
          return res.status(agentCheck.status).json({ error: agentCheck.message });
        }
      }
      if (node.promptGroupId && node.promptGroupId.trim()) {
        const promptCheck = await ensureUserCanUsePromptGroup(
          req.user.id,
          req.user.role,
          node.promptGroupId,
        );
        if (!promptCheck.ok) {
          return res.status(promptCheck.status).json({ error: promptCheck.message });
        }
      }
    }

    const workflow = await Workflow.create({
      userId: req.user.id,
      name: name.trim(),
      nodes,
      edges,
    });

    res.status(201).json(workflow.toObject ? workflow.toObject() : workflow);
  } catch (error) {
    logger.error('[Workflows] createWorkflow error:', error);
    res.status(500).json({ error: 'Failed to create workflow' });
  }
}

async function updateWorkflow(req, res) {
  try {
    const workflow = await Workflow.findOne(getWorkflowFilter(req, req.params.id));

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const { name, nodes, edges, snapshotImage } = req.body;

    if (name !== undefined && typeof name === 'string') {
      workflow.name = name.trim();
    }
    if (Array.isArray(nodes)) {
      const sanitizedNodes = nodes.map((n) => ({
        ...n,
        promptGroupId:
          n.promptGroupId && String(n.promptGroupId).trim()
            ? String(n.promptGroupId).trim()
            : null,
        agentId:
          n.agentId && String(n.agentId).trim() ? String(n.agentId).trim() : null,
        selectedTools:
          n.selectedTools !== undefined
            ? (Array.isArray(n.selectedTools) ? n.selectedTools : null)
            : undefined,
      }));
      const hasInvalidNode = sanitizedNodes.some(
        (n) => !n.promptGroupId || !n.agentId,
      );
      if (sanitizedNodes.length > 0 && hasInvalidNode) {
        return res.status(400).json({
          error: 'All workflow steps must have a prompt and agent selected',
        });
      }
      for (const node of sanitizedNodes) {
        if (node.agentId) {
          const agentCheck = await ensureUserCanUseAgent(req.user.id, req.user.role, node.agentId);
          if (!agentCheck.ok) {
            return res.status(agentCheck.status).json({ error: agentCheck.message });
          }
        }
        if (node.promptGroupId && node.promptGroupId.trim()) {
          const promptCheck = await ensureUserCanUsePromptGroup(
            req.user.id,
            req.user.role,
            node.promptGroupId,
          );
          if (!promptCheck.ok) {
            return res.status(promptCheck.status).json({ error: promptCheck.message });
          }
        }
      }
      workflow.nodes = sanitizedNodes;
    }
    if (Array.isArray(edges)) {
      workflow.edges = edges.map((e) => ({
        ...e,
        feedOutputToNext:
          e.feedOutputToNext !== undefined
            ? (typeof e.feedOutputToNext === 'boolean' ? e.feedOutputToNext : true)
            : undefined,
      }));
    }
    if (snapshotImage !== undefined && typeof snapshotImage === 'string') {
      workflow.snapshotImage = snapshotImage;
    }

    await workflow.save();
    res.json(workflow.toObject ? workflow.toObject() : workflow);
  } catch (error) {
    logger.error('[Workflows] updateWorkflow error:', error);
    res.status(500).json({ error: 'Failed to update workflow' });
  }
}

async function deleteWorkflow(req, res) {
  try {
    const result = await Workflow.findOneAndDelete(getWorkflowFilter(req, req.params.id));

    if (!result) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    res.status(204).end();
  } catch (error) {
    logger.error('[Workflows] deleteWorkflow error:', error);
    res.status(500).json({ error: 'Failed to delete workflow' });
  }
}

async function runWorkflow(req, res) {
  try {
    const workflow = await Workflow.findOne(getWorkflowFilter(req, req.params.id));

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const hasInvalidNode = (workflow.nodes || []).some(
      (n) => !n?.promptGroupId || !n?.agentId,
    );
    if ((workflow.nodes || []).length === 0 || hasInvalidNode) {
      return res.status(400).json({
        error: 'All workflow steps must have a prompt and agent selected',
      });
    }

    const effectiveUserId = req.user.role === SystemRoles.ADMIN ? workflow.userId : req.user.id;
    const result = await executeWorkflow({
      workflowId: req.params.id,
      userId: effectiveUserId,
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Workflow run failed' });
    }

    res.status(201).json({ run: result.run, conversationId: result.conversationId });
  } catch (error) {
    logger.error('[Workflows] runWorkflow error:', error);
    res.status(500).json({ error: 'Failed to run workflow' });
  }
}

async function listWorkflowRuns(req, res) {
  try {
    const workflow = await Workflow.findOne(getWorkflowFilter(req, req.params.id));

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
    const runsQuery = { workflowId: req.params.id };
    if (req.user.role !== SystemRoles.ADMIN) {
      runsQuery.userId = req.user.id;
    }
    const runs = await WorkflowRun.find(runsQuery)
      .sort({ runAt: -1 })
      .limit(limit)
      .lean();

    res.json(runs);
  } catch (error) {
    logger.error('[Workflows] listWorkflowRuns error:', error);
    res.status(500).json({ error: 'Failed to list workflow runs' });
  }
}

async function listWorkflowSchedules(req, res) {
  try {
    const workflow = await Workflow.findOne(getWorkflowFilter(req, req.params.id));

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const effectiveUserId = req.user.role === SystemRoles.ADMIN ? workflow.userId : req.user.id;
    const schedules = await listSchedulesForWorkflow(effectiveUserId, req.params.id);
    res.json(schedules);
  } catch (error) {
    logger.error('[Workflows] listWorkflowSchedules error:', error);
    res.status(500).json({ error: 'Failed to list workflow schedules' });
  }
}

async function createWorkflowSchedule(req, res) {
  try {
    const workflow = await Workflow.findOne(getWorkflowFilter(req, req.params.id));

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const { name, scheduleType, cronExpression, runAt, timezone } = req.body;

    if (!name || !scheduleType) {
      return res.status(400).json({ error: 'Missing required fields: name, scheduleType' });
    }

    if (scheduleType === 'recurring' && !cronExpression) {
      return res.status(400).json({ error: 'cronExpression required for recurring schedules' });
    }

    if (scheduleType === 'one-off' && !runAt) {
      return res.status(400).json({ error: 'runAt required for one-off schedules' });
    }

    const effectiveUserId = req.user.role === SystemRoles.ADMIN ? workflow.userId : req.user.id;
    const schedule = await createScheduleForWorkflow(effectiveUserId, {
      name,
      workflowId: req.params.id,
      scheduleType,
      cronExpression,
      runAt,
      timezone,
    });

    res.status(201).json(schedule);
  } catch (error) {
    logger.error('[Workflows] createWorkflowSchedule error:', error);
    res.status(500).json({ error: 'Failed to create workflow schedule' });
  }
}

async function updateWorkflowSchedule(req, res) {
  try {
    const workflow = await Workflow.findOne(getWorkflowFilter(req, req.params.id));

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const effectiveUserId = req.user.role === SystemRoles.ADMIN ? workflow.userId : req.user.id;
    const schedule = await updateScheduleForWorkflow(
      effectiveUserId,
      req.params.scheduleId,
      req.body,
      req.params.id,
    );

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    res.json(schedule);
  } catch (error) {
    logger.error('[Workflows] updateWorkflowSchedule error:', error);
    res.status(500).json({ error: 'Failed to update workflow schedule' });
  }
}

async function deleteWorkflowSchedule(req, res) {
  try {
    const workflow = await Workflow.findOne(getWorkflowFilter(req, req.params.id));

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const effectiveUserId = req.user.role === SystemRoles.ADMIN ? workflow.userId : req.user.id;
    const deleted = await deleteScheduleForWorkflow(
      effectiveUserId,
      req.params.scheduleId,
      req.params.id,
    );

    if (!deleted) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    res.status(204).end();
  } catch (error) {
    logger.error('[Workflows] deleteWorkflowSchedule error:', error);
    res.status(500).json({ error: 'Failed to delete workflow schedule' });
  }
}

async function runWorkflowSchedule(req, res) {
  try {
    const workflow = await Workflow.findOne(getWorkflowFilter(req, req.params.id));

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const effectiveUserId = req.user.role === SystemRoles.ADMIN ? workflow.userId : req.user.id;
    const result = await runScheduleForWorkflow(
      effectiveUserId,
      req.params.scheduleId,
      req.params.id,
    );

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
    logger.error('[Workflows] runWorkflowSchedule error:', error);
    res.status(500).json({ error: 'Failed to run workflow schedule' });
  }
}

module.exports = {
  checkWorkflowAccess,
  checkAgentAccess,
  listWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  runWorkflow,
  listWorkflowRuns,
  listWorkflowSchedules,
  createWorkflowSchedule,
  updateWorkflowSchedule,
  deleteWorkflowSchedule,
  runWorkflowSchedule,
};
