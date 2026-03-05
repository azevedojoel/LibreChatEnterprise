/**
 * Project tools - context sections and changelog for user-scoped projects.
 * Tools receive userId and projectId from the conversation's userProjectId.
 */
const { Tool } = require('@langchain/core/tools');
const { appendLog, tail, search, range } = require('~/server/services/UserProject/projectLogService');
const {
  upsertSection,
  patchSections,
  deleteSection,
} = require('~/server/services/UserProject/projectContextSectionService');

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

  tools.project_section_update = new (class extends Tool {
    name = 'project_section_update';
    description =
      'Create or replace a project context section. Use to add or update sections (e.g. overview, tasks). Format: # Title (id=sectionId) + content.';
    schema = {
      type: 'object',
      properties: {
        sectionId: { type: 'string', description: 'Section ID (slug, e.g. overview, tasks)' },
        title: { type: 'string', description: 'Section title for display' },
        content: { type: 'string', description: 'Section content (markdown). Optional, defaults to empty string.' },
      },
      required: ['sectionId', 'title'],
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { sectionId, title, content } = args || {};
      if (!sectionId || !title) return toJson({ error: 'sectionId and title are required' });
      try {
        await upsertSection(pid, uid, { sectionId, title, content: content ?? '' });
        return toJson({ success: true });
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to update section' });
      }
    }
  })();

  tools.project_section_patch = new (class extends Tool {
    name = 'project_section_patch';
    description =
      'Batch update project context sections in one call. Upsert multiple sections and optionally delete others. Use to build or replace the full context in one shot.';
    schema = {
      type: 'object',
      properties: {
        sections: {
          type: 'array',
          description: 'Sections to create or update. Each: { sectionId, title, content }',
          items: {
            type: 'object',
            properties: {
              sectionId: { type: 'string', description: 'Section ID (slug, e.g. overview, tasks)' },
              title: { type: 'string', description: 'Section title' },
              content: { type: 'string', description: 'Section content (markdown)' },
            },
            required: ['sectionId', 'title', 'content'],
          },
        },
        deleteIds: {
          type: 'array',
          description: 'Section IDs to remove',
          items: { type: 'string' },
        },
      },
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { sections = [], deleteIds = [] } = args || {};
      const sec = Array.isArray(sections) ? sections : [];
      const del = Array.isArray(deleteIds) ? deleteIds : [];
      if (sec.length === 0 && del.length === 0) {
        return toJson({ error: 'Provide at least one of sections or deleteIds' });
      }
      try {
        const result = await patchSections(pid, uid, { sections: sec, deleteIds: del });
        return toJson({ success: true, ...result });
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to patch sections' });
      }
    }
  })();

  tools.project_section_delete = new (class extends Tool {
    name = 'project_section_delete';
    description = 'Remove a project context section by sectionId.';
    schema = {
      type: 'object',
      properties: {
        sectionId: { type: 'string', description: 'Section ID to remove (e.g. overview, tasks)' },
      },
      required: ['sectionId'],
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { sectionId } = args || {};
      if (!sectionId) return toJson({ error: 'sectionId is required' });
      try {
        const deleted = await deleteSection(pid, uid, sectionId);
        return toJson({ success: true, deleted });
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to delete section' });
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
