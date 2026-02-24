/**
 * Organization service - CRUD operations for CRM organizations (companies).
 */
const dbModels = require('~/db/models');

const Organization = dbModels.Organization;

const NOT_DELETED = { $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }] };

function escapeRegex(str = '') {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} projectId
 * @param {string} name
 */
async function getOrganizationByName(projectId, name) {
  if (!name || typeof name !== 'string' || !name.trim()) return null;
  const escaped = escapeRegex(name.trim());
  return Organization.findOne({
    projectId,
    name: { $regex: `^${escaped}$`, $options: 'i' },
    ...NOT_DELETED,
  }).lean();
}

/**
 * @param {Object} params
 * @param {string} params.projectId
 * @param {Object} params.data
 * @param {string} params.data.name
 * @param {string} [params.data.domain]
 * @param {Record<string, unknown>} [params.data.metadata]
 */
async function createOrganization({ projectId, data }) {
  const org = await Organization.create({
    projectId,
    name: data.name,
    domain: data.domain,
    metadata: data.metadata,
  });
  return typeof org.toObject === 'function' ? org.toObject() : org;
}

/**
 * @param {string} projectId
 * @param {string} organizationId
 * @param {Object} updates
 */
async function updateOrganization(projectId, organizationId, updates) {
  return Organization.findOneAndUpdate(
    { _id: organizationId, projectId, ...NOT_DELETED },
    {
      $set: {
        ...(updates.name != null && { name: updates.name }),
        ...(updates.domain !== undefined && { domain: updates.domain }),
        ...(updates.metadata !== undefined && { metadata: updates.metadata }),
      },
    },
    { new: true },
  ).lean();
}

/**
 * @param {string} projectId
 * @param {string} organizationId
 */
async function getOrganizationById(projectId, organizationId) {
  return Organization.findOne({ _id: organizationId, projectId, ...NOT_DELETED }).lean();
}

/**
 * @param {string} projectId
 * @param {Object} [opts]
 * @param {number} [opts.limit]
 * @param {number} [opts.skip]
 */
async function listOrganizations(projectId, opts = {}) {
  const { limit = 50, skip = 0 } = opts;
  return Organization.find({ projectId, ...NOT_DELETED }).sort({ name: 1 }).skip(skip).limit(limit).lean();
}

/**
 * @param {string} projectId
 * @param {string} organizationId
 */
async function softDeleteOrganization(projectId, organizationId) {
  return Organization.findOneAndUpdate(
    { _id: organizationId, projectId, ...NOT_DELETED },
    { $set: { deletedAt: new Date() } },
    { new: true },
  ).lean();
}

module.exports = {
  createOrganization,
  updateOrganization,
  getOrganizationById,
  getOrganizationByName,
  listOrganizations,
  softDeleteOrganization,
};
