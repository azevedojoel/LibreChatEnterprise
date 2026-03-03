/**
 * Project tools - context doc and changelog for user-scoped projects.
 * Tools receive userId and projectId from the conversation's userProjectId.
 */
const { Tool } = require('@langchain/core/tools');
const { getUserProject, updateUserProject } = require('~/models/UserProject');
const { appendLog, tail, search, range } = require('~/server/services/UserProject/projectLogService');

const toJson = (obj) => (typeof obj === 'string' ? obj : JSON.stringify(obj ?? null));

function sanitizeError(msg) {
  if (!msg) return 'Unable to access project data';
  if (/project|access denied|not found/i.test(msg)) return 'Unable to access project data';
  return msg;
}

/**
 * @param {{ userId: string, projectId: string }} options
 * @returns {Record<string, Tool>}
 */
function createProjectTools({ userId, projectId }) {
  if (!projectId) {
    return {};
  }

  const pid = typeof projectId === 'string' ? projectId : projectId?.toString?.();
  const uid = userId ?? 'agent';

  const tools = {};

  tools.project_read = new (class extends Tool {
    name = 'project_read';
    description = 'Returns the project context document. Small curated context the agent maintains for this project.';
    schema = { type: 'object', properties: {} };
    static get jsonSchema() {
      return { type: 'object', properties: {} };
    }
    async _call() {
      try {
        const project = await getUserProject(uid, pid);
        if (!project) return toJson({ error: 'Project not found' });
        return toJson({ context: project.context ?? '' });
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to read project context' });
      }
    }
  })();

  tools.project_write = new (class extends Tool {
    name = 'project_write';
    description =
      'Overwrites the project context document. Use to update the curated context (budget, state, key facts) after doing work.';
    schema = {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The new context document content' },
      },
      required: ['content'],
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { content } = args || {};
      try {
        const project = await updateUserProject(uid, pid, { context: content ?? '' });
        if (!project) return toJson({ error: 'Project not found' });
        return toJson({ success: true });
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to write project context' });
      }
    }
  })();

  tools.project_log = new (class extends Tool {
    name = 'project_log';
    description =
      'Appends an entry to the project changelog. Append-only log for history. Never injected automatically.';
    schema = {
      type: 'object',
      properties: {
        entry: { type: 'string', description: 'The log entry to append' },
      },
      required: ['entry'],
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { entry } = args || {};
      if (!entry) return toJson({ error: 'entry is required' });
      try {
        await appendLog(pid, uid, entry);
        return toJson({ success: true });
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to append log' });
      }
    }
  })();

  tools.project_log_tail = new (class extends Tool {
    name = 'project_log_tail';
    description = 'Returns the last n entries from the project changelog.';
    schema = {
      type: 'object',
      properties: {
        n: { type: 'number', description: 'Number of entries to return (default 10, max 100)' },
      },
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { n } = args || {};
      try {
        const entries = await tail(pid, uid, n);
        return toJson({ entries });
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to get log tail' });
      }
    }
  })();

  tools.project_log_search = new (class extends Tool {
    name = 'project_log_search';
    description = 'Search the project changelog by keyword.';
    schema = {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (keyword)' },
        limit: { type: 'number', description: 'Max entries to return (default 50)' },
      },
      required: ['query'],
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { query, limit } = args || {};
      if (!query) return toJson({ error: 'query is required' });
      try {
        const entries = await search(pid, uid, query, { limit });
        return toJson({ entries });
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to search log' });
      }
    }
  })();

  tools.project_log_range = new (class extends Tool {
    name = 'project_log_range';
    description = 'Returns changelog entries between two timestamps. Use ISO date strings for from and to.';
    schema = {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start timestamp (ISO date)' },
        to: { type: 'string', description: 'End timestamp (ISO date)' },
        limit: { type: 'number', description: 'Max entries to return (default 100)' },
      },
      required: ['from', 'to'],
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { from, to, limit } = args || {};
      if (!from || !to) return toJson({ error: 'from and to are required' });
      try {
        const entries = await range(pid, uid, from, to, { limit });
        return toJson({ entries });
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to get log range' });
      }
    }
  })();

  return tools;
}

module.exports = { createProjectTools };
