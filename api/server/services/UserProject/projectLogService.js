const mongoose = require('mongoose');
const { UserProject, ProjectLog } = require('~/db/models');
const { findUser } = require('~/models');

/**
 * Verify user has access to the project (owner or workspace member when shared).
 * @param {string} projectId - Project ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>}
 */
const verifyProjectAccess = async (projectId, userId) => {
  const project = await UserProject.findById(projectId).lean();
  if (!project) return false;
  if (project.user === userId) return true;
  if (project.workspace_id) {
    const userDoc = await findUser({ _id: userId }, 'workspace_id');
    const userWorkspaceId = userDoc?.workspace_id?.toString?.() ?? userDoc?.workspace_id;
    const projectWorkspaceId = project.workspace_id?.toString?.() ?? project.workspace_id;
    return !!(
      userWorkspaceId &&
      projectWorkspaceId &&
      userWorkspaceId === projectWorkspaceId
    );
  }
  return false;
};

/** @deprecated Use verifyProjectAccess for workspace-shared project support */
const verifyProjectOwnership = async (projectId, userId) => {
  return verifyProjectAccess(projectId, userId);
};

/**
 * Append an entry to the project changelog.
 * @param {string} projectId - Project ID
 * @param {string} userId - User ID
 * @param {string} entry - Log entry text
 * @returns {Promise<Object>}
 */
const appendLog = async (projectId, userId, entry) => {
  const hasAccess = await verifyProjectAccess(projectId, userId);
  if (!hasAccess) {
    throw new Error('Project not found or access denied');
  }
  const doc = await ProjectLog.create({
    projectId: new mongoose.Types.ObjectId(projectId),
    entry: String(entry || ''),
  });
  return doc.toObject();
};

/**
 * Get the last n entries from the project changelog.
 * @param {string} projectId - Project ID
 * @param {string} userId - User ID
 * @param {number} n - Number of entries
 * @returns {Promise<Object[]>}
 */
const tail = async (projectId, userId, n = 10) => {
  const hasAccess = await verifyProjectAccess(projectId, userId);
  if (!hasAccess) {
    throw new Error('Project not found or access denied');
  }
  const limit = Math.min(Math.max(1, parseInt(n, 10) || 10), 100);
  const entries = await ProjectLog.find({ projectId: new mongoose.Types.ObjectId(projectId) })
    .sort({ timestamp: -1 })
    .limit(limit)
    .select('timestamp entry')
    .lean();
  return entries.reverse();
};

/**
 * Search entries by keyword (regex).
 * @param {string} projectId - Project ID
 * @param {string} userId - User ID
 * @param {string} query - Search query
 * @param {Object} options - { limit }
 * @returns {Promise<Object[]>}
 */
const search = async (projectId, userId, query, { limit = 50 } = {}) => {
  const hasAccess = await verifyProjectAccess(projectId, userId);
  if (!hasAccess) {
    throw new Error('Project not found or access denied');
  }
  const searchLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 100);
  const regex = new RegExp(
    String(query || '')
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .trim() || '.',
    'i',
  );
  const entries = await ProjectLog.find({
    projectId: new mongoose.Types.ObjectId(projectId),
    entry: regex,
  })
    .sort({ timestamp: -1 })
    .limit(searchLimit)
    .select('timestamp entry')
    .lean();
  return entries;
};

/**
 * Get entries between timestamps.
 * @param {string} projectId - Project ID
 * @param {string} userId - User ID
 * @param {string|Date} from - Start timestamp (ISO or Date)
 * @param {string|Date} to - End timestamp (ISO or Date)
 * @param {Object} options - { limit }
 * @returns {Promise<Object[]>}
 */
const range = async (projectId, userId, from, to, { limit = 100 } = {}) => {
  const hasAccess = await verifyProjectAccess(projectId, userId);
  if (!hasAccess) {
    throw new Error('Project not found or access denied');
  }
  const rangeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 100), 500);
  const fromDate = from ? new Date(from) : new Date(0);
  const toDate = to ? new Date(to) : new Date();
  const entries = await ProjectLog.find({
    projectId: new mongoose.Types.ObjectId(projectId),
    timestamp: { $gte: fromDate, $lte: toDate },
  })
    .sort({ timestamp: 1 })
    .limit(rangeLimit)
    .select('timestamp entry')
    .lean();
  return entries;
};

module.exports = {
  appendLog,
  tail,
  search,
  range,
  verifyProjectAccess,
  verifyProjectOwnership,
};
