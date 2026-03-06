const mongoose = require('mongoose');
const { UserProject, ProjectLog, ProjectContextSection } = require('~/db/models');
const { findUser } = require('~/models');
const { getWorkspaceById, isWorkspaceAdmin, getWorkspaceAdminId } = require('~/models/Workspace');
const { getSections, patchSections } = require('~/server/services/UserProject/projectContextSectionService');

/**
 * List user projects with pagination. Includes own projects and workspace-shared projects.
 * @param {string} userId - User ID
 * @param {Object} options - { limit, cursor, status? }
 * @returns {Promise<{ projects: Object[], nextCursor: string|null }>}
 */
const listUserProjects = async (userId, { limit = 25, cursor, status = 'active' } = {}) => {
  const userDoc = await findUser({ _id: userId }, 'workspace_id');
  const userWorkspaceId = userDoc?.workspace_id?.toString?.() ?? userDoc?.workspace_id ?? null;

  let query =
    userWorkspaceId != null
      ? {
          $or: [
            { user: userId },
            { workspace_id: new mongoose.Types.ObjectId(userWorkspaceId) },
          ],
        }
      : { user: userId };

  if (status === 'active') {
    query = {
      $and: [
        query,
        { $or: [{ status: { $exists: false } }, { status: 'active' }] },
      ],
    };
  } else if (status === 'archived') {
    query = { ...query, status: 'archived' };
  }
  // status === 'all' means no status filter

  const sort = { updatedAt: -1 };

  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
      query.updatedAt = { $lt: new Date(decoded.updatedAt) };
    } catch (err) {
      // Invalid cursor, ignore
    }
  }

  const projects = await UserProject.find(query)
    .select('_id name context description tags status workspace_id createdAt updatedAt user ownerId isInbound')
    .sort(sort)
    .limit(limit + 1)
    .lean();

  const mapped = projects.map((p) => ({
    _id: p._id?.toString?.() ?? p._id,
    projectId: p._id?.toString?.() ?? p._id,
    name: p.name,
    context: p.context ?? '',
    description: p.description ?? '',
    tags: p.tags ?? [],
    status: p.status ?? 'active',
    owner: p.ownerId?.toString?.() ?? p.user,
    shared: !!p.workspace_id,
    isInbound: !!p.isInbound,
    lastUpdated: p.updatedAt,
    workspace_id: p.workspace_id?.toString?.() ?? p.workspace_id ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));

  let nextCursor = null;
  if (mapped.length > limit) {
    mapped.pop();
    const last = projects[limit - 1];
    if (last?.updatedAt) {
      nextCursor = Buffer.from(JSON.stringify({ updatedAt: last.updatedAt.toISOString() })).toString(
        'base64',
      );
    }
  }

  return { projects: mapped, nextCursor };
};

/**
 * Create a user project.
 * @param {string} userId - User ID
 * @param {Object} data - { name, description?, tags?, sharedWithWorkspace?, templateProjectId? }
 * @returns {Promise<{ project?: Object, error?: string, adminMemberId?: string }>}
 *   On success: { project }. On shared+not admin: { error, adminMemberId }.
 */
const createUserProject = async (
  userId,
  { name, description, tags, sharedWithWorkspace, templateProjectId } = {},
) => {
  if (sharedWithWorkspace) {
    const userDoc = await findUser({ _id: userId }, 'workspace_id');
    const workspaceId = userDoc?.workspace_id?.toString?.() ?? userDoc?.workspace_id;
    if (!workspaceId) {
      throw new Error('Cannot create shared project: user has no workspace');
    }
    const workspace = await getWorkspaceById(workspaceId, 'adminIds createdBy');
    if (!isWorkspaceAdmin(workspace, userId)) {
      const adminMemberId = getWorkspaceAdminId(workspace);
      return {
        error:
          'Only workspace admins can create shared projects. Use human_notify_human to notify the workspace admin (adminMemberId) to create a shared project for you.',
        adminMemberId: adminMemberId || undefined,
      };
    }
    const project = await UserProject.create({
      user: userId,
      name: name?.trim() || 'Untitled',
      description: (description && String(description).trim()) || '',
      tags: Array.isArray(tags) ? tags.filter((t) => typeof t === 'string').slice(0, 50) : [],
      status: 'active',
      ownerId: new mongoose.Types.ObjectId(userId),
      workspace_id: new mongoose.Types.ObjectId(workspaceId),
    });
    const obj = project.toObject();
    const result = {
      ...obj,
      _id: obj._id?.toString?.() ?? obj._id,
      workspace_id: obj.workspace_id?.toString?.() ?? obj.workspace_id ?? null,
      shared: true,
    };
    if (templateProjectId) {
      try {
        const templateSections = await getSections(templateProjectId, userId);
        if (templateSections.length > 0) {
          const sections = templateSections.map((s) => ({
            sectionId: s.sectionId,
            title: s.title,
            content: s.content ?? '',
          }));
          await patchSections(result._id, userId, { sections });
        }
      } catch (err) {
        // Ignore template copy errors (e.g. no access to template)
      }
    }
    return { project: result };
  }

  const project = await UserProject.create({
    user: userId,
    name: name?.trim() || 'Untitled',
    description: (description && String(description).trim()) || '',
    tags: Array.isArray(tags) ? tags.filter((t) => typeof t === 'string').slice(0, 50) : [],
    status: 'active',
    ownerId: new mongoose.Types.ObjectId(userId),
  });
  const obj = project.toObject();
  const result = {
    ...obj,
    _id: obj._id?.toString?.() ?? obj._id,
    workspace_id: null,
    shared: false,
  };
  if (templateProjectId) {
    try {
      const templateSections = await getSections(templateProjectId, userId);
      if (templateSections.length > 0) {
        const sections = templateSections.map((s) => ({
          sectionId: s.sectionId,
          title: s.title,
          content: s.content ?? '',
        }));
        await patchSections(result._id, userId, { sections });
      }
    } catch (err) {
      // Ignore template copy errors
    }
  }
  return { project: result };
};

const INBOUND_PROJECT_EMAIL_RULES_TEMPLATE = `# Email routing rules

Match sender or subject to route to a project. Use project_switch to assign the conversation.

## Examples

From: brad.eye@cenegenicsjax.com → Project: John Smith
From: @cenegenicsjax.com → Search CRM for sender, assign to their project
Subject contains: "Martinez" → Project: Martinez Family`;

/**
 * Create the Inbound project for a workspace. Used for email routing rules.
 * One Inbound project per workspace; cannot be deleted.
 * @param {string} workspaceId - Workspace ID
 * @param {string} createdBy - User ID (workspace creator/admin)
 * @returns {Promise<Object>} Created project
 */
const createInboundProjectForWorkspace = async (workspaceId, createdBy) => {
  const workspaceObjId = new mongoose.Types.ObjectId(workspaceId);
  const createdByObjId = new mongoose.Types.ObjectId(createdBy);

  const project = await UserProject.create({
    user: createdBy,
    name: 'Inbound',
    description: 'Email routing rules for inbound emails. Edit the email-rules section to configure routing.',
    tags: ['inbound', 'email'],
    status: 'active',
    ownerId: createdByObjId,
    workspace_id: workspaceObjId,
    isInbound: true,
  });

  const projectId = project._id.toString();
  await patchSections(projectId, createdBy, {
    sections: [
      {
        sectionId: 'email-rules',
        title: 'Email routing rules',
        content: INBOUND_PROJECT_EMAIL_RULES_TEMPLATE,
      },
    ],
  });

  const obj = project.toObject();
  return {
    ...obj,
    _id: obj._id?.toString?.() ?? obj._id,
    workspace_id: obj.workspace_id?.toString?.() ?? obj.workspace_id ?? null,
    shared: true,
    isInbound: true,
  };
};

/**
 * Get a user project by ID. Allows access for owner or workspace members (when project is shared).
 * @param {string} userId - User ID
 * @param {string} projectId - Project ID
 * @returns {Promise<Object|null>}
 */
const getUserProject = async (userId, projectId) => {
  const project = await UserProject.findById(projectId).lean();
  if (!project) return null;

  const toResult = (p) => ({
    ...p,
    _id: p._id?.toString?.() ?? p._id,
    workspace_id: p.workspace_id?.toString?.() ?? p.workspace_id ?? null,
    shared: !!p.workspace_id,
    isInbound: !!p.isInbound,
    description: p.description ?? '',
    tags: p.tags ?? [],
    status: p.status ?? 'active',
  });

  if (project.user === userId) {
    return toResult(project);
  }

  if (project.workspace_id) {
    const userDoc = await findUser({ _id: userId }, 'workspace_id');
    const userWorkspaceId = userDoc?.workspace_id?.toString?.() ?? userDoc?.workspace_id;
    const projectWorkspaceId = project.workspace_id?.toString?.() ?? project.workspace_id;
    if (userWorkspaceId && projectWorkspaceId && userWorkspaceId === projectWorkspaceId) {
      return toResult(project);
    }
  }

  return null;
};

/**
 * Update a user project. Allows workspace access for name/context/metadata updates.
 * @param {string} userId - User ID
 * @param {string} projectId - Project ID
 * @param {Object} data - { name?, context?, description?, tags?, ownerId? }
 * @returns {Promise<Object|null>}
 */
const MAX_CONTEXT_LENGTH = 100 * 1024; // 100KB

const updateUserProject = async (userId, projectId, data) => {
  const project = await getUserProject(userId, projectId);
  if (!project) return null;

  const update = {};
  if (data.name !== undefined && data.name != null && typeof data.name === 'string') {
    update.name = data.name.trim();
  }
  if (data.context !== undefined) {
    update.context = String(data.context ?? '').slice(0, MAX_CONTEXT_LENGTH);
  }
  if (data.description !== undefined) {
    update.description = String(data.description ?? '').trim().slice(0, 2000);
  }
  if (data.tags !== undefined) {
    update.tags = Array.isArray(data.tags)
      ? data.tags.filter((t) => typeof t === 'string').slice(0, 50)
      : [];
  }
  if (data.ownerId !== undefined && data.ownerId != null) {
    let canChangeOwner = false;
    if (project.workspace_id) {
      const workspace = await getWorkspaceById(project.workspace_id.toString(), 'adminIds createdBy');
      canChangeOwner = !!workspace && isWorkspaceAdmin(workspace, userId);
    }
    if (canChangeOwner) {
      update.ownerId = new mongoose.Types.ObjectId(data.ownerId);
    }
  }
  if (Object.keys(update).length === 0) {
    return project;
  }

  const userDoc = await findUser({ _id: userId }, 'workspace_id');
  const userWorkspaceId = userDoc?.workspace_id?.toString?.() ?? userDoc?.workspace_id;
  const accessQuery =
    userWorkspaceId != null
      ? {
          _id: projectId,
          $or: [
            { user: userId },
            { workspace_id: new mongoose.Types.ObjectId(userWorkspaceId) },
          ],
        }
      : { _id: projectId, user: userId };

  const updated = await UserProject.findOneAndUpdate(accessQuery, { $set: update }, { new: true })
    .select('_id name context description tags status workspace_id createdAt updatedAt')
    .lean();

  if (!updated) return null;

  return {
    ...updated,
    _id: updated._id?.toString?.() ?? updated._id,
    workspace_id: updated.workspace_id?.toString?.() ?? updated.workspace_id ?? null,
    shared: !!updated.workspace_id,
  };
};

/**
 * Archive a user project (soft delete). Only owner or workspace admin can archive.
 * @param {string} userId - User ID
 * @param {string} projectId - Project ID
 * @returns {Promise<boolean>}
 */
const archiveUserProject = async (userId, projectId) => {
  const project = await UserProject.findById(projectId).lean();
  if (!project) return false;

  if (project.isInbound) {
    return false;
  }

  if (project.workspace_id) {
    const workspace = await getWorkspaceById(project.workspace_id.toString(), 'adminIds createdBy');
    if (!isWorkspaceAdmin(workspace, userId)) {
      return false;
    }
  } else {
    if (project.user !== userId) {
      return false;
    }
  }

  const result = await UserProject.updateOne(
    { _id: projectId },
    { $set: { status: 'archived' } },
  );
  return result.modifiedCount > 0;
};

/**
 * Delete a user project and its changelog entries.
 * Shared projects: only workspace admin can delete.
 * Private projects: only owner can delete.
 * @param {string} userId - User ID
 * @param {string} projectId - Project ID
 * @returns {Promise<boolean>}
 */
const deleteUserProject = async (userId, projectId) => {
  const project = await UserProject.findById(projectId).lean();
  if (!project) return false;

  if (project.isInbound) {
    return false;
  }

  if (project.workspace_id) {
    const workspace = await getWorkspaceById(project.workspace_id.toString(), 'adminIds createdBy');
    if (!isWorkspaceAdmin(workspace, userId)) {
      return false;
    }
  } else {
    if (project.user !== userId) {
      return false;
    }
  }

  const objId = new mongoose.Types.ObjectId(projectId);
  await ProjectLog.deleteMany({ projectId: objId });
  await ProjectContextSection.deleteMany({ projectId: objId });
  await UserProject.deleteOne({ _id: projectId });
  return true;
};

module.exports = {
  listUserProjects,
  createUserProject,
  createInboundProjectForWorkspace,
  getUserProject,
  updateUserProject,
  deleteUserProject,
  archiveUserProject,
};
