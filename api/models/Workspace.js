const { logger } = require('@librechat/data-schemas');
const { Workspace } = require('~/db/models');

/**
 * Find workspace by slug (for email routing).
 * @param {string} slug - Workspace slug
 * @param {string|string[]} [fieldsToSelect] - Fields to select
 * @returns {Promise<Object|null>}
 */
const getWorkspaceBySlug = async function (slug, fieldsToSelect = null) {
  if (!slug || typeof slug !== 'string') return null;
  const trimmed = slug.trim().toLowerCase();
  if (!trimmed) return null;

  const query = Workspace.findOne({ slug: trimmed });
  if (fieldsToSelect) {
    query.select(fieldsToSelect);
  }
  return await query.lean();
};

/**
 * Get workspace by ID.
 * @param {string} workspaceId - Workspace ID
 * @param {string|string[]} [fieldsToSelect] - Fields to select
 * @returns {Promise<Object|null>}
 */
const getWorkspaceById = async function (workspaceId, fieldsToSelect = null) {
  if (!workspaceId) return null;
  const query = Workspace.findById(workspaceId);
  if (fieldsToSelect) {
    query.select(fieldsToSelect);
  }
  return await query.lean();
};

/**
 * List all workspaces.
 * @returns {Promise<Array<{_id: string, name: string, slug: string, maxMembers?: number}>>}
 */
const listWorkspaces = async function () {
  const workspaces = await Workspace.find().select('name slug maxMembers').lean();
  return workspaces.map((w) => ({
    _id: w._id.toString(),
    id: w._id?.toString(),
    name: w.name,
    slug: w.slug,
    maxMembers: w.maxMembers ?? 3,
  }));
};

/**
 * Create workspace.
 * @param {Object} data - { name, slug, createdBy }
 * @returns {Promise<Object>}
 */
const createWorkspace = async function (data) {
  const { name, slug, createdBy } = data;
  if (!name || !slug || !createdBy) {
    throw new Error('name, slug, and createdBy are required');
  }
  const normalizedSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-|-$/g, '');
  if (!normalizedSlug) {
    throw new Error('Invalid slug');
  }
  const existing = await Workspace.findOne({ slug: normalizedSlug }).lean();
  if (existing) {
    throw new Error('Workspace with this slug already exists');
  }
  const workspace = await Workspace.create({
    name: name.trim(),
    slug: normalizedSlug,
    createdBy,
    adminIds: [createdBy],
    maxMembers: 3,
  });

  try {
    const { createInboundProjectForWorkspace } = require('~/models/UserProject');
    await createInboundProjectForWorkspace(workspace._id, createdBy);
  } catch (err) {
    logger.warn('[Workspace] Failed to create Inbound project for workspace', {
      workspaceId: workspace._id?.toString(),
      error: err?.message,
    });
  }

  return workspace.toObject ? workspace.toObject() : workspace;
};

/**
 * Update workspace.
 * @param {string} workspaceId - Workspace ID
 * @param {Object} updates - { name?, slug?, maxMembers?, adminIds? }
 * @returns {Promise<Object|null>}
 */
const updateWorkspace = async function (workspaceId, updates) {
  if (!workspaceId) return null;
  const { name, slug, maxMembers, adminIds } = updates;
  const set = {};
  if (name !== undefined) set.name = name.trim();
  if (slug !== undefined) {
    const normalizedSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-|-$/g, '');
    if (normalizedSlug) {
      const existing = await Workspace.findOne({
        slug: normalizedSlug,
        _id: { $ne: workspaceId },
      }).lean();
      if (existing) {
        throw new Error('Workspace with this slug already exists');
      }
      set.slug = normalizedSlug;
    }
  }
  if (maxMembers !== undefined && typeof maxMembers === 'number' && maxMembers >= 1) {
    set.maxMembers = maxMembers;
  }
  if (adminIds !== undefined && Array.isArray(adminIds)) {
    const mongoose = require('mongoose');
    set.adminIds = adminIds
      .filter((id) => id != null && mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
  }
  if (Object.keys(set).length === 0) return getWorkspaceById(workspaceId);
  const workspace = await Workspace.findByIdAndUpdate(workspaceId, { $set: set }, { new: true }).lean();
  return workspace;
};

/**
 * Check if a user is a workspace admin.
 * Backward compat: if adminIds is empty, createdBy is the sole admin.
 * @param {Object} workspace - Workspace document (lean)
 * @param {string} userId - User ID to check
 * @returns {boolean}
 */
const isWorkspaceAdmin = function (workspace, userId) {
  if (!workspace || !userId) return false;
  const idStr = userId.toString();
  const adminIds = workspace.adminIds || [];
  if (adminIds.length > 0) {
    return adminIds.some((aid) => (aid && aid.toString()) === idStr);
  }
  return workspace.createdBy && workspace.createdBy.toString() === idStr;
};

/**
 * Get the workspace admin member ID for notify flow (createdBy or first adminIds).
 * @param {Object} workspace - Workspace document (lean)
 * @returns {string|null}
 */
const getWorkspaceAdminId = function (workspace) {
  if (!workspace) return null;
  const adminIds = workspace.adminIds || [];
  if (adminIds.length > 0 && adminIds[0]) {
    return adminIds[0].toString();
  }
  return workspace.createdBy ? workspace.createdBy.toString() : null;
};

/**
 * Delete workspace. Clears workspace_id from all users and deletes related invites first.
 * @param {string} workspaceId - Workspace ID
 * @returns {Promise<void>}
 */
const deleteWorkspace = async function (workspaceId) {
  if (!workspaceId) return;
  const { User, Invite } = require('~/db/models');
  await User.updateMany({ workspace_id: workspaceId }, { $unset: { workspace_id: '' } });
  await Invite.deleteMany({ workspaceId });
  await Workspace.findByIdAndDelete(workspaceId);
};

/**
 * Set a routing rule (create or update). Trigger = topic, recipient = memberId.
 * @param {string} workspaceId - Workspace ID
 * @param {string} trigger - Topic/trigger (e.g. "commercial auto", "new leads")
 * @param {string} recipient - User ID (memberId) who handles this
 * @param {string} [instructions] - Optional instructions for the human
 * @returns {Promise<Object|null>}
 */
const setRoutingRule = async function (workspaceId, trigger, recipient, instructions) {
  if (!workspaceId || !trigger || !recipient) return null;
  const mongoose = require('mongoose');
  if (!mongoose.Types.ObjectId.isValid(recipient)) return null;
  const topic = String(trigger).trim();
  const memberId = new mongoose.Types.ObjectId(recipient);
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) return null;
  const rules = workspace.routingRules || [];
  const existingIndex = rules.findIndex((r) => r.topic === topic);
  const newRule = { topic, memberId, ...(instructions != null && { instructions: String(instructions).trim() }) };
  if (existingIndex >= 0) {
    rules[existingIndex] = newRule;
  } else {
    rules.push(newRule);
  }
  workspace.routingRules = rules;
  await workspace.save();
  return workspace.toObject ? workspace.toObject() : workspace;
};

/**
 * Delete a routing rule by trigger.
 * @param {string} workspaceId - Workspace ID
 * @param {string} trigger - Topic/trigger to remove
 * @returns {Promise<Object|null>}
 */
const deleteRoutingRule = async function (workspaceId, trigger) {
  if (!workspaceId || !trigger) return null;
  const topic = String(trigger).trim();
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) return null;
  const rules = (workspace.routingRules || []).filter((r) => r.topic !== topic);
  workspace.routingRules = rules;
  await workspace.save();
  return workspace.toObject ? workspace.toObject() : workspace;
};

module.exports = {
  getWorkspaceBySlug,
  getWorkspaceById,
  listWorkspaces,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  setRoutingRule,
  deleteRoutingRule,
  isWorkspaceAdmin,
  getWorkspaceAdminId,
};
