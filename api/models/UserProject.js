const mongoose = require('mongoose');
const { UserProject, ProjectLog } = require('~/db/models');

/**
 * List user projects with pagination.
 * @param {string} userId - User ID
 * @param {Object} options - { limit, cursor }
 * @returns {Promise<{ projects: Object[], nextCursor: string|null }>}
 */
const listUserProjects = async (userId, { limit = 25, cursor } = {}) => {
  const query = { user: userId };
  const sort = { updatedAt: -1 };
  let skip = 0;

  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
      query.updatedAt = { $lt: new Date(decoded.updatedAt) };
    } catch (err) {
      // Invalid cursor, ignore
    }
  }

  const projects = await UserProject.find(query)
    .select('_id name context createdAt updatedAt')
    .sort(sort)
    .limit(limit + 1)
    .lean();

  let nextCursor = null;
  if (projects.length > limit) {
    projects.pop();
    const last = projects[projects.length - 1];
    if (last?.updatedAt) {
      nextCursor = Buffer.from(JSON.stringify({ updatedAt: last.updatedAt.toISOString() })).toString(
        'base64',
      );
    }
  }

  return { projects, nextCursor };
};

/**
 * Create a user project.
 * @param {string} userId - User ID
 * @param {Object} data - { name }
 * @returns {Promise<Object>}
 */
const createUserProject = async (userId, { name }) => {
  const project = await UserProject.create({ user: userId, name: name?.trim() || 'Untitled' });
  return project.toObject();
};

/**
 * Get a user project by ID (user-scoped).
 * @param {string} userId - User ID
 * @param {string} projectId - Project ID
 * @returns {Promise<Object|null>}
 */
const getUserProject = async (userId, projectId) => {
  const project = await UserProject.findOne({ _id: projectId, user: userId }).lean();
  return project;
};

/**
 * Update a user project.
 * @param {string} userId - User ID
 * @param {string} projectId - Project ID
 * @param {Object} data - { name?, context? }
 * @returns {Promise<Object|null>}
 */
const MAX_CONTEXT_LENGTH = 100 * 1024; // 100KB

const updateUserProject = async (userId, projectId, data) => {
  const update = {};
  if (data.name !== undefined && data.name != null && typeof data.name === 'string') {
    update.name = data.name.trim();
  }
  if (data.context !== undefined) {
    update.context = String(data.context ?? '').slice(0, MAX_CONTEXT_LENGTH);
  }
  if (Object.keys(update).length === 0) {
    return getUserProject(userId, projectId);
  }
  const project = await UserProject.findOneAndUpdate(
    { _id: projectId, user: userId },
    { $set: update },
    { new: true },
  ).lean();
  return project;
};

/**
 * Delete a user project and its changelog entries.
 * @param {string} userId - User ID
 * @param {string} projectId - Project ID
 * @returns {Promise<boolean>}
 */
const deleteUserProject = async (userId, projectId) => {
  const project = await UserProject.findOne({ _id: projectId, user: userId });
  if (!project) {
    return false;
  }
  const objId = new mongoose.Types.ObjectId(projectId);
  await ProjectLog.deleteMany({ projectId: objId });
  await UserProject.deleteOne({ _id: projectId, user: userId });
  return true;
};

module.exports = {
  listUserProjects,
  createUserProject,
  getUserProject,
  updateUserProject,
  deleteUserProject,
};
