const { v4 } = require('uuid');
const { tool } = require('@langchain/core/tools');
const { Tools } = require('librechat-data-provider');
const { GenerationJobManager } = require('@librechat/api');
const { executeSubAgent } = require('./executeSubAgent');

/** Maximum number of sub-agent tasks per run_sub_agent call (parallel mode). Prevents resource exhaustion. */
const MAX_SUB_AGENT_TASKS = 2;
/** Maximum tasks when sequential: true. One-at-a-time is less resource-intensive. */
const MAX_SUB_AGENT_TASKS_SEQUENTIAL = 5;
/** Max prompt length for sub-agent (must match executeSubAgent). Truncate context when chaining. */
const MAX_SUB_AGENT_PROMPT_LENGTH = 32 * 1024;

/** Prefix for previous agent output when chaining sequentially. */
const SEQUENTIAL_CONTEXT_PREFIX = `--- Context from previous agent ---

`;

const SEQUENTIAL_CONTEXT_SUFFIX = `

--- Your task ---

`;
/** Buffer for truncation suffix when context exceeds limit */
const TRUNCATION_SUFFIX = '\n\n... (truncated for length)';

/**
 * Create the run_sub_agent tool. Reads parentStreamId, toolCallId, userId from config at invoke time.
 * Rejects if already inside a sub-agent run (nested subagents not allowed).
 * Supports single run (agentId+prompt), parallel runs (tasks array, max 2), or sequential runs (tasks + sequential: true, max 5).
 * When sequential, each agent receives the previous agent's output as context.
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

      const { agentId, prompt, selectedTools, tasks: rawTasks, sequential, projectId } = rawInput ?? {};
      const isSequential = sequential === true;

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

      const maxTasks = isSequential ? MAX_SUB_AGENT_TASKS_SEQUENTIAL : MAX_SUB_AGENT_TASKS;
      if (tasks.length > maxTasks) {
        return JSON.stringify({
          success: false,
          error: `Maximum ${maxTasks} sub-agent tasks per call${isSequential ? ' (sequential mode)' : ''}. You provided ${tasks.length}.`,
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

      const resolvedProjectId =
        projectId && String(projectId).trim() ? String(projectId).trim() : null;

      const taskConfigs = tasks.map((t, i) => ({
        agentId: String(t.agentId),
        prompt: String(t.prompt).trim(),
        selectedTools: t.selectedTools,
        subAgentStreamId: v4(),
        taskIndex: i,
        projectId: resolvedProjectId,
      }));

      try {
        let results;
        if (isSequential && taskConfigs.length > 1) {
          results = [];
          let previousOutput = '';
          for (let i = 0; i < taskConfigs.length; i++) {
            const tc = taskConfigs[i];
            await GenerationJobManager.emitChunk(parentStreamId, {
              event: 'sub_agent_started',
              toolCallId,
              subAgentStreamId: tc.subAgentStreamId,
              agentId: tc.agentId,
              prompt: tc.prompt.slice(0, 200),
              taskIndex: tc.taskIndex,
            });
            let effectivePrompt;
            if (i === 0) {
              effectivePrompt = tc.prompt;
            } else {
              const fixedLen = SEQUENTIAL_CONTEXT_PREFIX.length + SEQUENTIAL_CONTEXT_SUFFIX.length + tc.prompt.length;
              const maxContextLen = Math.max(0, MAX_SUB_AGENT_PROMPT_LENGTH - fixedLen - TRUNCATION_SUFFIX.length);
              const context = previousOutput.length <= maxContextLen
                ? previousOutput
                : previousOutput.slice(0, maxContextLen) + TRUNCATION_SUFFIX;
              effectivePrompt = SEQUENTIAL_CONTEXT_PREFIX + context + SEQUENTIAL_CONTEXT_SUFFIX + tc.prompt;
            }
            const r = await executeSubAgent({
              agentId: tc.agentId,
              prompt: effectivePrompt,
              userId: String(userId),
              subAgentStreamId: tc.subAgentStreamId,
              parentStreamId,
              toolCallId,
              selectedTools: tc.selectedTools,
              projectId: tc.projectId,
              signal: config?.signal,
            });
            results.push(r);
            if (!r.success) {
              break;
            }
            previousOutput = r.output ?? '';
          }
        } else {
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
          results = await Promise.all(
            taskConfigs.map((tc) =>
              executeSubAgent({
                agentId: tc.agentId,
                prompt: tc.prompt,
                userId: String(userId),
                subAgentStreamId: tc.subAgentStreamId,
                parentStreamId,
                toolCallId,
                selectedTools: tc.selectedTools,
                projectId: tc.projectId,
                signal: config?.signal,
              }),
            ),
          );
        }

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
        `Sub-agents: fast parallel or sequential reads. Run one or more sub-agents with prompts. REQUIRED: Call list_agents first to get valid agent IDs. Pass agentId+prompt for a single run, or tasks array (max ${MAX_SUB_AGENT_TASKS} parallel, max ${MAX_SUB_AGENT_TASKS_SEQUENTIAL} sequential). Pass sequential: true with multiple tasks to chain agents—each receives the previous output as context. Use for research, analysis, lookups. Destructive tools are stripped—sub-agents run only non-destructive tools. If you need writes, use transfer instead.`,
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
            description: `Run multiple agents in parallel (max ${MAX_SUB_AGENT_TASKS}) or sequentially (max ${MAX_SUB_AGENT_TASKS_SEQUENTIAL}). Use instead of agentId+prompt for batch.`,
          },
          sequential: {
            type: 'boolean',
            description:
              'When true with multiple tasks, run sequentially—each agent receives previous output as context. Default false (parallel).',
          },
          projectId: {
            type: 'string',
            description:
              'Optional UserProject ID to run the sub-agent with project context. Use list_user_projects to fetch available projects (includes personal and workspace-shared). Use _id as projectId.',
          },
        },
        required: [],
      },
    },
  );
}

module.exports = { createRunSubAgentTool };
