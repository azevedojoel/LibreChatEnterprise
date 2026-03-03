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
 * @returns {Promise<Array<{_id: string, name: string, slug: string}>>}
 */
const listWorkspaces = async function () {
  const workspaces = await Workspace.find().select('name slug').lean();
  return workspaces.map((w) => ({
    _id: w._id.toString(),
    name: w.name,
    slug: w.slug,
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
  });
  return workspace.toObject ? workspace.toObject() : workspace;
};

/**
 * Update workspace.
 * @param {string} workspaceId - Workspace ID
 * @param {Object} updates - { name?, slug? }
 * @returns {Promise<Object|null>}
 */
const updateWorkspace = async function (workspaceId, updates) {
  if (!workspaceId) return null;
  const { name, slug } = updates;
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
  if (Object.keys(set).length === 0) return getWorkspaceById(workspaceId);
  const workspace = await Workspace.findByIdAndUpdate(workspaceId, { $set: set }, { new: true }).lean();
  return workspace;
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

module.exports = {
  getWorkspaceBySlug,
  getWorkspaceById,
  listWorkspaces,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
};
