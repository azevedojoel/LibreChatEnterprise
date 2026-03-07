/**
 * list_agents tool - Lists agents the user can run (ACL-aware).
 * Part of run_sub_agent capability. Call before run_sub_agent to discover available agents.
 */
const { tool } = require('@langchain/core/tools');
const { Tools } = require('librechat-data-provider');
const { listAgentsForUser } = require('./listAgentsForUser');

/**
 * @param {Object} opts
 * @param {import('express').Request} [opts.req] - Request with user context
 * @returns {import('@langchain/core/tools').StructuredTool}
 */
function createListAgentsTool(opts = {}) {
  const req = opts.req;

  return tool(
    async (rawInput) => {
      if (!req?.user?.id) {
        return JSON.stringify({ error: 'User context required.' });
      }

      const { search, limit, after, category, promoted } = rawInput ?? {};

      try {
        const result = await listAgentsForUser({
          userId: req.user.id,
          role: req.user.role ?? 'USER',
          search: typeof search === 'string' ? search : undefined,
          limit: typeof limit === 'number' ? limit : parseInt(limit, 10) || 25,
          after: typeof after === 'string' ? after : undefined,
          category: typeof category === 'string' ? category : undefined,
          promoted:
            promoted === true || promoted === '1'
              ? true
              : promoted === false || promoted === '0'
                ? false
                : undefined,
        });

        return JSON.stringify(result);
      } catch (err) {
        return JSON.stringify({
          data: [],
          has_more: false,
          error: err?.message ?? 'Failed to list agents',
        });
      }
    },
    {
      name: Tools.list_agents,
      description:
        'List agents you can run. REQUIRED before run_sub_agent—you must call this first to get valid agent IDs. Returns id, name, description for each. Use with run_sub_agent for fast parallel or sequential reads.',
      schema: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Filter by name or description' },
          limit: { type: 'number', description: 'Max results (default 25, max 50)' },
          after: { type: 'string', description: 'Pagination cursor from previous response' },
          category: { type: 'string', description: 'Filter by category' },
          promoted: {
            oneOf: [
              { type: 'boolean' },
              { type: 'string', enum: ['0', '1'] },
            ],
            description: 'Filter promoted agents (true/1) or non-promoted (false/0)',
          },
        },
        required: [],
      },
    },
  );
}

module.exports = { createListAgentsTool };
