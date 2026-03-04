/**
 * create_plan and update_todo tools for Coder agent.
 */
const path = require('path');
const fs = require('fs').promises;
const { tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');

/**
 * Parse markdown plan into todo items (lines starting with - [ ] or - [x] or *)
 */
function parsePlanToTodos(planContent) {
  const lines = planContent.split(/\r?\n/);
  const items = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const unchecked = trimmed.match(/^[-*]\s+\[[\s ]\]\s+(.+)$/);
    const checked = trimmed.match(/^[-*]\s+\[[xX]\]\s+(.+)$/);
    const plain = trimmed.match(/^[-*]\s+(.+)$/);
    if (unchecked) {
      items.push({ item: unchecked[1].trim(), status: 'pending' });
    } else if (checked) {
      items.push({ item: checked[1].trim(), status: 'complete' });
    } else if (plain && !trimmed.startsWith('---')) {
      items.push({ item: plain[1].trim(), status: 'pending' });
    }
  }
  return items;
}

/**
 * @param {Object} params
 * @param {string} params.workspaceRoot - Absolute workspace path
 */
function createCreatePlanTool({ workspaceRoot }) {
  const root = workspaceRoot;

  return tool(
    async (rawInput) => {
      const { plan_content } = rawInput ?? {};
      if (!plan_content || typeof plan_content !== 'string') {
        return 'Error: plan_content is required';
      }

      try {
        await fs.mkdir(root, { recursive: true });
        const planPath = path.join(root, 'plan.md');
        await fs.writeFile(planPath, plan_content, 'utf8');

        const items = parsePlanToTodos(plan_content);
        const todoPath = path.join(root, 'todo.json');
        await fs.writeFile(todoPath, JSON.stringify({ items }, null, 2), 'utf8');

        return JSON.stringify({
          plan: plan_content,
          items,
          summary: `Plan created with ${items.length} items`,
        });
      } catch (err) {
        logger.error('[create_plan] Error:', err);
        return JSON.stringify({ error: err.message });
      }
    },
    {
      name: 'create_plan',
      description:
        'Write plan.md and todo.json from plan content. Call after reading requirements from Ellis handoff. Format: # Title, summary paragraph, then ## Tasks with - [ ] for pending and - [x] for complete. Each task on its own line. Tool names in backticks (e.g. `workspace_status`) are fine.',
      schema: {
        type: 'object',
        properties: {
          plan_content: {
            type: 'string',
            description:
              'Markdown plan: # Title, summary, ## Tasks, then - [ ] or - [x] items. Use - [ ] for pending, - [x] for complete.',
          },
        },
        required: ['plan_content'],
      },
    },
  );
}

/**
 * @param {Object} params
 * @param {string} params.workspaceRoot - Absolute workspace path
 */
function createUpdateTodoTool({ workspaceRoot }) {
  const root = workspaceRoot;

  return tool(
    async (rawInput) => {
      const { item, status } = rawInput ?? {};
      if (!item || typeof item !== 'string') {
        return 'Error: item is required';
      }
      if (!status || !['pending', 'complete'].includes(status)) {
        return 'Error: status must be "pending" or "complete"';
      }

      try {
        const todoPath = path.join(root, 'todo.json');
        let data = { items: [] };
        try {
          const content = await fs.readFile(todoPath, 'utf8');
          data = JSON.parse(content);
          if (!Array.isArray(data.items)) {
            data.items = [];
          }
        } catch {
          // File does not exist or invalid
        }

        const items = data.items;
        const idx = items.findIndex((i) => (i.item ?? i).toString().trim() === item.trim());
        if (idx >= 0) {
          items[idx] = { ...items[idx], item: items[idx].item ?? item, status };
        } else {
          items.push({ item: item.trim(), status });
        }

        await fs.mkdir(root, { recursive: true });
        await fs.writeFile(todoPath, JSON.stringify({ items }, null, 2), 'utf8');

        return items.map((i) => `- [${i.status}] ${i.item}`).join('\n');
      } catch (err) {
        logger.error('[update_todo] Error:', err);
        return `Error: ${err.message}`;
      }
    },
    {
      name: 'update_todo',
      description: 'Mark a todo item complete or pending. Updates todo.json.',
      schema: {
        type: 'object',
        properties: {
          item: { type: 'string', description: 'Todo item text' },
          status: {
            type: 'string',
            enum: ['pending', 'complete'],
            description: 'Item status',
          },
        },
        required: ['item', 'status'],
      },
    },
  );
}

module.exports = {
  createCreatePlanTool,
  createUpdateTodoTool,
};
