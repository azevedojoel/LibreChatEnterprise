const { v4 } = require('uuid');
const { tool } = require('@langchain/core/tools');
const { Tools } = require('librechat-data-provider');
const { GenerationJobManager } = require('@librechat/api');
const { executeSubAgent } = require('./executeSubAgent');

/** Maximum number of sub-agent tasks per run_sub_agent call. Prevents resource exhaustion. */
const MAX_SUB_AGENT_TASKS = 2;

/**
 * Create the run_sub_agent tool. Reads parentStreamId, toolCallId, userId from config at invoke time.
 * Rejects if already inside a sub-agent run (nested subagents not allowed).
 * Supports single run (agentId+prompt) or parallel runs (tasks array, max 2 tasks).
 * Note: req must remain the same object for the duration of the run (used for nested sub-agent check).
 *
 * @param {Object} [opts]
 * @param {import('express').Request} [opts.req] - Request (used to detect subAgentRun)
 * @returns {import('@langchain/core/tools').StructuredTool}
 */
function createRunSubAgentTool(opts = {}) {
  const req = opts.req;

  return tool(
    async (rawInput, config) => {
      if (req?.body?.subAgentRun) {
        return JSON.stringify({
          success: false,
          error: 'run_sub_agent cannot be called from within a sub-agent run.',
        });
      }

      const { agentId, prompt, selectedTools, tasks: rawTasks } = rawInput ?? {};

      let tasks;
      if (Array.isArray(rawTasks) && rawTasks.length > 0) {
        tasks = rawTasks.map((t) => ({
          agentId: t?.agentId,
          prompt: t?.prompt,
          selectedTools: Array.isArray(t?.selectedTools) ? t.selectedTools : null,
        }));
      } else if (agentId && prompt) {
        tasks = [
          {
            agentId,
            prompt,
            selectedTools: Array.isArray(selectedTools) ? selectedTools : null,
          },
        ];
      } else {
        return JSON.stringify({
          success: false,
          error: 'Provide agentId and prompt, or a non-empty tasks array.',
        });
      }

      const invalid = tasks.find((t) => !t.agentId || !t.prompt);
      if (invalid) {
        return JSON.stringify({
          success: false,
          error: 'Each task must have agentId and prompt.',
        });
      }

      if (tasks.length > MAX_SUB_AGENT_TASKS) {
        return JSON.stringify({
          success: false,
          error: `Maximum ${MAX_SUB_AGENT_TASKS} sub-agent tasks per call. You provided ${tasks.length}.`,
        });
      }

      const metadata = config?.configurable ?? config?.metadata ?? {};
      const parentStreamId = metadata.thread_id;
      const toolCallId = config?.toolCall?.id;
      const userId = metadata.user_id;

      if (!parentStreamId || !toolCallId || !userId) {
        return JSON.stringify({
          success: false,
          error: 'Missing run context (thread_id, toolCallId, or user_id).',
        });
      }

      const taskConfigs = tasks.map((t, i) => ({
        agentId: String(t.agentId),
        prompt: String(t.prompt).trim(),
        selectedTools: t.selectedTools,
        subAgentStreamId: v4(),
        taskIndex: i,
      }));

      try {
        for (const tc of taskConfigs) {
          await GenerationJobManager.emitChunk(parentStreamId, {
            event: 'sub_agent_started',
            toolCallId,
            subAgentStreamId: tc.subAgentStreamId,
            agentId: tc.agentId,
            prompt: tc.prompt.slice(0, 200),
            taskIndex: tc.taskIndex,
          });
        }

        const results = await Promise.all(
          taskConfigs.map((tc) =>
            executeSubAgent({
              agentId: tc.agentId,
              prompt: tc.prompt,
              userId: String(userId),
              subAgentStreamId: tc.subAgentStreamId,
              parentStreamId,
              toolCallId,
              selectedTools: tc.selectedTools,
              signal: config?.signal,
            }),
          ),
        );

        if (taskConfigs.length === 1) {
          const r = results[0];
          if (r.success) {
            return JSON.stringify({ success: true, output: r.output ?? '' });
          }
          return JSON.stringify({ success: false, error: r.error ?? 'Unknown error' });
        }

        const formattedResults = results.map((r, i) => ({
          agentId: taskConfigs[i].agentId,
          success: r.success,
          ...(r.success ? { output: r.output ?? '' } : { error: r.error ?? 'Unknown error' }),
        }));
        const anySuccess = results.some((r) => r.success);
        return JSON.stringify({
          success: anySuccess,
          results: formattedResults,
        });
      } catch (err) {
        const msg = err?.message || String(err);
        return JSON.stringify({ success: false, error: msg });
      }
    },
    {
      name: Tools.run_sub_agent,
      description:
        `Run one or more sub-agents with prompts. REQUIRED: Call list_agents first to get valid agent IDs. Pass agentId+prompt for a single run, or tasks array (max ${MAX_SUB_AGENT_TASKS} tasks) to run multiple agents in parallel. Blocks until the sub-agent(s) complete. Returns final text output. Destructive tools are not allowed in sub-agent runs.`,
      schema: {
        type: 'object',
        properties: {
          agentId: {
            type: 'string',
            description: 'Agent ID from list_agents (REQUIRED: call list_agents first). Use for single run.',
          },
          prompt: { type: 'string', description: 'Prompt to send to the sub-agent (single run)' },
          selectedTools: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional: restrict sub-agent to these tools (null = all, [] = none)',
          },
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                agentId: { type: 'string', description: 'Agent ID from list_agents' },
                prompt: { type: 'string', description: 'Prompt to send to the sub-agent' },
                selectedTools: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Optional: restrict sub-agent to these tools',
                },
              },
              required: ['agentId', 'prompt'],
            },
            description: `Run multiple agents in parallel (max ${MAX_SUB_AGENT_TASKS}). Use instead of agentId+prompt for batch.`,
          },
        },
        required: [],
      },
    },
  );
}

module.exports = { createRunSubAgentTool };
