/**
 * Project tools - context sections, changelog, and management for user-scoped projects.
 * Context tools receive userId and projectId from the conversation's userProjectId.
 * Management tools receive userId, conversationId, and req (no project required).
 */
const { Tool } = require('@langchain/core/tools');
const { appendLog, tail, search, range } = require('~/server/services/UserProject/projectLogService');
const {
  upsertSection,
  patchSections,
  deleteSection,
  getFormattedContext,
} = require('~/server/services/UserProject/projectContextSectionService');
const {
  createUserProject,
  listUserProjects,
  archiveUserProject,
  updateUserProject,
  getUserProject,
} = require('~/models/UserProject');
const { saveConvo, getConvo } = require('~/models/Conversation');

const toJson = (obj) => (typeof obj === 'string' ? obj : JSON.stringify(obj ?? null));

const NO_PROJECT_ERROR = 'No project assigned. Use project_switch to assign a project first.';

function sanitizeError(msg) {
  if (!msg) return 'Unable to access project data';
  if (/project|access denied|not found/i.test(msg)) return 'Unable to access project data';
  return msg;
}

/**
 * Resolve projectId at call time. Supports:
 * - { userId, projectId }: returns projectId (static)
 * - { userId, conversationId, req }: fetches via getConvo (dynamic)
 * @param {{ userId?: string, projectId?: string, conversationId?: string, req?: Object }} options
 * @returns {Promise<string|null>}
 */
async function resolveProjectId(options) {
  if (options.projectId != null && options.projectId !== '') {
    return typeof options.projectId === 'string'
      ? options.projectId
      : options.projectId?.toString?.() ?? null;
  }
  if (options.conversationId && options.req?.user?.id) {
    const convo = await getConvo(options.req.user.id, options.conversationId);
    const up = convo?.userProjectId?.toString?.() ?? convo?.userProjectId ?? null;
    return up;
  }
  return null;
}

/**
 * @param {{ userId?: string, projectId?: string, conversationId?: string, req?: Object }} options
 * @returns {Record<string, Tool>}
 */
function createProjectTools({ userId, projectId, conversationId, req }) {
  const uid = userId ?? 'agent';
  const hasStaticProject = projectId != null && projectId !== '';
  const hasDynamicResolution = conversationId && req?.user?.id;
  if (!hasStaticProject && !hasDynamicResolution) {
    return {};
  }

  const opts = { userId, projectId, conversationId, req };
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
      const pid = await resolveProjectId(opts);
      if (!pid) return toJson({ error: NO_PROJECT_ERROR });
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
      const pid = await resolveProjectId(opts);
      if (!pid) return toJson({ error: NO_PROJECT_ERROR });
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
      const pid = await resolveProjectId(opts);
      if (!pid) return toJson({ error: NO_PROJECT_ERROR });
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
      const pid = await resolveProjectId(opts);
      if (!pid) return toJson({ error: NO_PROJECT_ERROR });
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
      const pid = await resolveProjectId(opts);
      if (!pid) return toJson({ error: NO_PROJECT_ERROR });
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
      const pid = await resolveProjectId(opts);
      if (!pid) return toJson({ error: NO_PROJECT_ERROR });
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
      const pid = await resolveProjectId(opts);
      if (!pid) return toJson({ error: NO_PROJECT_ERROR });
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

/**
 * Project management tools - create, list, archive, update metadata.
 * Do NOT require conversationUserProjectId. Receive userId, conversationId, req.
 * @param {{ userId: string, conversationId?: string, req?: Object }} options
 * @returns {Record<string, Tool>}
 */
function createProjectManagementTools({ userId, conversationId, req } = {}) {
  const uid = userId ?? 'agent';

  const tools = {};

  tools.project_create = new (class extends Tool {
    name = 'project_create';
    description =
      'Create a new project. Required: name. Optional: description, tags[], sharedWithWorkspace (workspace admin only), templateProjectId. If sharedWithWorkspace and not admin, use human_notify_human.';
    schema = {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name' },
        description: { type: 'string', description: 'Project description' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for the project',
        },
        sharedWithWorkspace: {
          type: 'boolean',
          description: 'If true, create workspace-shared project (admin only)',
        },
        templateProjectId: { type: 'string', description: 'Copy sections from this project' },
      },
      required: ['name'],
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { name, description, tags, sharedWithWorkspace, templateProjectId } = args || {};
      if (!name || !String(name).trim()) return toJson({ error: 'name is required' });
      try {
        const result = await createUserProject(uid, {
          name: String(name).trim(),
          description,
          tags,
          sharedWithWorkspace: !!sharedWithWorkspace,
          templateProjectId,
        });
        if (result.error) {
          return toJson({ error: result.error, adminMemberId: result.adminMemberId });
        }
        const project = result.project;
        if (conversationId && req && project?._id) {
          try {
            await saveConvo(req, { conversationId, userProjectId: project._id }, {
              context: 'project_create tool - assign new project to conversation',
            });
          } catch (e) {
            // Ignore - project was created, just couldn't assign to conversation
          }
        }
        const projectContext =
          project?._id
            ? (await getFormattedContext(project._id.toString(), uid)) ||
              '(No context yet. Use project_section_patch or project_section_update to add sections.)'
            : null;
        return toJson({
          success: true,
          projectId: project._id,
          name: project.name,
          shared: project.shared,
          ...(projectContext != null && { projectContext }),
          ...project,
        });
      } catch (e) {
        return toJson({ error: e?.message || 'Failed to create project' });
      }
    }
  })();

  tools.project_list = new (class extends Tool {
    name = 'project_list';
    description =
      'List projects the user can access. Optional: limit, cursor, status (active|archived|all).';
    schema = {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max projects (default 25)' },
        cursor: { type: 'string', description: 'Pagination cursor' },
        status: {
          type: 'string',
          enum: ['active', 'archived', 'all'],
          description: 'Filter by status (default active)',
        },
      },
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { limit = 25, cursor, status = 'active' } = args || {};
      try {
        const result = await listUserProjects(uid, { limit, cursor, status });
        return toJson(result);
      } catch (e) {
        return toJson({ error: e?.message || 'Failed to list projects' });
      }
    }
  })();

  tools.project_archive = new (class extends Tool {
    name = 'project_archive';
    description =
      'Archive a project (soft delete). Required: projectId. Owner or workspace admin only. Inbound (system) projects cannot be archived.';
    schema = {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID to archive' },
      },
      required: ['projectId'],
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { projectId } = args || {};
      if (!projectId) return toJson({ error: 'projectId is required' });
      try {
        const project = await getUserProject(uid, projectId);
        if (project?.isInbound) {
          return toJson({ error: 'Inbound project cannot be archived (system project)' });
        }
        const archived = await archiveUserProject(uid, projectId);
        if (!archived) {
          return toJson({ error: 'Project not found or access denied' });
        }
        return toJson({ success: true, archived: true });
      } catch (e) {
        return toJson({ error: e?.message || 'Failed to archive project' });
      }
    }
  })();

  tools.project_update_metadata = new (class extends Tool {
    name = 'project_update_metadata';
    description = 'Update project metadata. Required: projectId. Optional: name, description, tags[], ownerId (workspace admin only, shared projects).';
    schema = {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID to update' },
        name: { type: 'string', description: 'New name' },
        description: { type: 'string', description: 'New description' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'New tags (replaces existing)',
        },
        ownerId: { type: 'string', description: 'New owner user ID' },
      },
      required: ['projectId'],
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { projectId, name, description, tags, ownerId } = args || {};
      if (!projectId) return toJson({ error: 'projectId is required' });
      try {
        const project = await updateUserProject(uid, projectId, {
          name,
          description,
          tags,
          ownerId,
        });
        if (!project) {
          return toJson({ error: 'Project not found or access denied' });
        }
        return toJson({ success: true, project });
      } catch (e) {
        return toJson({ error: e?.message || 'Failed to update project' });
      }
    }
  })();

  tools.project_switch = new (class extends Tool {
    name = 'project_switch';
    description =
      'Assign a project to this conversation. Required: projectId (use project_list to get IDs). Pass null to clear the project.';
    schema = {
      type: 'object',
      properties: {
        projectId: {
          oneOf: [{ type: 'string' }, { type: 'null' }],
          description: 'Project ID to assign, or null to clear',
        },
      },
      required: ['projectId'],
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { projectId } = args || {};
      if (!conversationId || !req) {
        return toJson({ error: 'conversationId and req are required' });
      }
      if (conversationId === 'new') {
        return toJson({
          error:
            'Conversation not yet created. Send a message first, then use project_switch to assign a project.',
        });
      }
      try {
        if (projectId == null || projectId === '') {
          await saveConvo(req, { conversationId, userProjectId: null });
          return toJson({ success: true, message: 'Project cleared from conversation' });
        }
        const project = await getUserProject(uid, projectId);
        if (!project) {
          return toJson({ error: 'Project not found or access denied' });
        }
        await saveConvo(req, { conversationId, userProjectId: projectId });
        const projectContext =
          (await getFormattedContext(projectId, uid)) ||
          '(No context yet. Use project_section_patch or project_section_update to add sections.)';
        return toJson({
          success: true,
          project,
          projectContext,
        });
      } catch (e) {
        return toJson({ error: e?.message || 'Failed to switch project' });
      }
    }
  })();

  return tools;
}

module.exports = { createProjectTools, createProjectManagementTools };
