/**
 * LangChain tools for managing scheduled agents.
 * Used when an agent has the manage_scheduling capability.
 *
 * Self-scheduling guard: Agents cannot schedule themselves to prevent infinite loops.
 */
const { tool } = require('@langchain/core/tools');
const { Tools } = require('librechat-data-provider');
const {
  listSchedulesForUser,
  createScheduleForUser,
  updateScheduleForUser,
  deleteScheduleForUser,
  runScheduleForUser,
  listRunsForUser,
  getRunForUser,
} = require('./schedulingService');

/**
 * @param {object} params
 * @param {string} params.userId - User ID for scoping
 * @param {string} [params.agentId] - Current agent ID (for self-scheduling guard)
 * @param {string[]} [params.schedulerTargetAgentIds] - Agent IDs this scheduler can schedule
 * @returns {Record<string, import('@langchain/core/tools').StructuredTool>}
 */
function createSchedulingTools({ userId, agentId: currentAgentId, schedulerTargetAgentIds = [] }) {
  const allowedTargetIds = new Set(Array.isArray(schedulerTargetAgentIds) ? schedulerTargetAgentIds : []);

  const isAgentAllowed = (agentId) => {
    if (allowedTargetIds.size === 0) {
      return false;
    }
    return allowedTargetIds.has(agentId);
  };
  const listSchedulesTool = tool(
    async () => {
      try {
        const schedules = await listSchedulesForUser(userId);
        return JSON.stringify(schedules);
      } catch (err) {
        return JSON.stringify({ error: err.message || 'Failed to list schedules' });
      }
    },
    {
      name: Tools.list_schedules,
      description:
        "List the user's scheduled prompts. Returns schedules with id, name, agentId, promptGroupId, scheduleType, cronExpression, runAt, enabled, timezone.",
      schema: { type: 'object', properties: {}, required: [] },
    },
  );

  const createScheduleTool = tool(
    async (rawInput) => {
      if (rawInput.agentId === currentAgentId) {
        return JSON.stringify({
          error: 'Agents cannot schedule themselves. Create a separate scheduling agent.',
        });
      }

      const { name, agentId, promptGroupId, scheduleType, cronExpression, runAt, timezone, selectedTools } =
        rawInput;

      if (!isAgentAllowed(agentId)) {
        return JSON.stringify({
          error:
            allowedTargetIds.size === 0
              ? 'No target agents configured. Add at least one agent to the scheduler target list.'
              : 'Agent is not in the scheduler target list. You can only schedule the configured target agents.',
        });
      }

      if (!name || !agentId || !promptGroupId || !scheduleType) {
        return JSON.stringify({
          error: 'Missing required fields: name, agentId, promptGroupId, scheduleType',
        });
      }
      if (scheduleType === 'recurring' && !cronExpression) {
        return JSON.stringify({ error: 'cronExpression required for recurring schedules' });
      }
      if (scheduleType === 'one-off' && !runAt) {
        return JSON.stringify({ error: 'runAt required for one-off schedules' });
      }

      try {
        const schedule = await createScheduleForUser(userId, {
          name,
          agentId,
          promptGroupId,
          scheduleType,
          cronExpression,
          runAt,
          timezone,
          selectedTools,
        });
        return JSON.stringify(schedule);
      } catch (err) {
        return JSON.stringify({ error: err.message || 'Failed to create schedule' });
      }
    },
    {
      name: Tools.create_schedule,
      description:
        'Schedule a prompt to run with an agent on a given interval. Infer agentId from the user request. Required: name, agentId (from injected list), promptGroupId (from injected prompt list), scheduleType. For recurring: cronExpression. For one-off: runAt (ISO date). Optional: timezone, selectedTools.',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Schedule name' },
          agentId: {
            type: 'string',
            description:
              'Agent ID from the injected target list. Infer from user request - NEVER ask the user. Match by name or purpose.',
          },
          promptGroupId: { type: 'string', description: 'Prompt group ID from the injected prompt list. Match user request to prompt name/command.' },
          scheduleType: {
            type: 'string',
            enum: ['recurring', 'one-off'],
            description: 'recurring uses cron; one-off uses runAt',
          },
          cronExpression: { type: 'string', description: 'Cron expression (e.g. 0 9 * * * for 9am daily)' },
          runAt: { type: 'string', description: 'ISO date for one-off run' },
          timezone: { type: 'string', description: 'Timezone e.g. UTC', default: 'UTC' },
          selectedTools: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional tool IDs to limit the scheduled run to',
          },
        },
        required: ['name', 'agentId', 'promptGroupId', 'scheduleType'],
      },
    },
  );

  const updateScheduleTool = tool(
    async (rawInput) => {
      const { scheduleId, agentId: newAgentId, ...rest } = rawInput;

      if (newAgentId && newAgentId === currentAgentId) {
        return JSON.stringify({
          error: 'Agents cannot schedule themselves. Create a separate scheduling agent.',
        });
      }

      if (newAgentId && !isAgentAllowed(newAgentId)) {
        return JSON.stringify({
          error:
            allowedTargetIds.size === 0
              ? 'No target agents configured. Add at least one agent to the scheduler target list.'
              : 'Agent is not in the scheduler target list. You can only schedule the configured target agents.',
        });
      }

      if (!scheduleId) {
        return JSON.stringify({ error: 'scheduleId is required' });
      }

      try {
        const schedule = await updateScheduleForUser(userId, scheduleId, {
          agentId: newAgentId,
          ...rest,
        });
        if (!schedule) {
          return JSON.stringify({ error: 'Schedule not found' });
        }
        return JSON.stringify(schedule);
      } catch (err) {
        return JSON.stringify({ error: err.message || 'Failed to update schedule' });
      }
    },
    {
      name: Tools.update_schedule,
      description:
        'Update an existing scheduled prompt. Provide scheduleId and any fields to update: name, agentId, promptGroupId, scheduleType, cronExpression, runAt, enabled, timezone, selectedTools.',
      schema: {
        type: 'object',
        properties: {
          scheduleId: { type: 'string', description: 'Schedule ID' },
          name: { type: 'string', description: 'Schedule name' },
          agentId: {
            type: 'string',
            description:
              'Agent ID from the injected target list. Infer from user request when changing agent - NEVER ask. Match by name or purpose.',
          },
          promptGroupId: { type: 'string', description: 'Prompt group ID from the injected prompt list' },
          scheduleType: { type: 'string', enum: ['recurring', 'one-off'] },
          cronExpression: { type: 'string' },
          runAt: { type: 'string' },
          enabled: { type: 'boolean' },
          timezone: { type: 'string' },
          selectedTools: { type: 'array', items: { type: 'string' } },
        },
        required: ['scheduleId'],
      },
    },
  );

  const deleteScheduleTool = tool(
    async (rawInput) => {
      const { scheduleId } = rawInput;
      if (!scheduleId) {
        return JSON.stringify({ error: 'scheduleId is required' });
      }
      try {
        const deleted = await deleteScheduleForUser(userId, scheduleId);
        if (!deleted) {
          return JSON.stringify({ error: 'Schedule not found' });
        }
        return JSON.stringify({ success: true });
      } catch (err) {
        return JSON.stringify({ error: err.message || 'Failed to delete schedule' });
      }
    },
    {
      name: Tools.delete_schedule,
      description: 'Delete a schedule by ID.',
      schema: {
        type: 'object',
        properties: { scheduleId: { type: 'string', description: 'Schedule ID' } },
        required: ['scheduleId'],
      },
    },
  );

  const runScheduleTool = tool(
    async (rawInput) => {
      const { scheduleId } = rawInput;
      if (!scheduleId) {
        return JSON.stringify({ error: 'scheduleId is required' });
      }
      try {
        const result = await runScheduleForUser(userId, scheduleId);
        return JSON.stringify(result);
      } catch (err) {
        return JSON.stringify({ error: err.message || 'Failed to run schedule' });
      }
    },
    {
      name: Tools.run_schedule,
      description:
        'Queue a schedule run by schedule ID. Returns immediately with runId and status (queued). Use get_run with runId to check progress or completion.',
      schema: {
        type: 'object',
        properties: { scheduleId: { type: 'string', description: 'Schedule ID' } },
        required: ['scheduleId'],
      },
    },
  );

  const listRunsTool = tool(
    async (rawInput) => {
      const limit = rawInput.limit;
      try {
        const runs = await listRunsForUser(userId, { limit });
        return JSON.stringify(runs);
      } catch (err) {
        return JSON.stringify({ error: err.message || 'Failed to list runs' });
      }
    },
    {
      name: Tools.list_runs,
      description: "List the user's scheduled run history. Optional limit (default 25, max 100).",
      schema: {
        type: 'object',
        properties: { limit: { type: 'number', description: 'Max number of runs to return' } },
        required: [],
      },
    },
  );

  const getRunTool = tool(
    async (rawInput) => {
      const { runId } = rawInput;
      if (!runId) {
        return JSON.stringify({ error: 'runId is required' });
      }
      try {
        const run = await getRunForUser(userId, runId);
        if (!run) {
          return JSON.stringify({ error: 'Run not found' });
        }
        return JSON.stringify(run);
      } catch (err) {
        return JSON.stringify({ error: err.message || 'Failed to get run' });
      }
    },
    {
      name: Tools.get_run,
      description: 'Get a single run by ID, including conversation and messages.',
      schema: {
        type: 'object',
        properties: { runId: { type: 'string', description: 'Run ID' } },
        required: ['runId'],
      },
    },
  );

  return {
    [Tools.list_schedules]: listSchedulesTool,
    [Tools.create_schedule]: createScheduleTool,
    [Tools.update_schedule]: updateScheduleTool,
    [Tools.delete_schedule]: deleteScheduleTool,
    [Tools.run_schedule]: runScheduleTool,
    [Tools.list_runs]: listRunsTool,
    [Tools.get_run]: getRunTool,
  };
}

module.exports = { createSchedulingTools };
