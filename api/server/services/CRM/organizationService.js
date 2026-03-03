/**
 * Organization service - CRUD operations for CRM organizations (companies).
 */
const mongoose = require('mongoose');
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
 * @param {Record<string, string|number|boolean>} [params.data.customFields]
 */
async function createOrganization({ projectId, data }) {
  const org = await Organization.create({
    projectId,
    name: data.name,
    domain: data.domain,
    metadata: data.metadata,
    customFields: data.customFields,
  });
  const obj = typeof org.toObject === 'function' ? org.toObject() : org;
  // Normalize id for agent convenience when chaining create -> get
  if (obj && obj._id) {
    obj.id = obj._id?.toString?.() ?? obj._id;
  }
  return obj;
}

/**
 * @param {string} projectId
 * @param {string|import('mongoose').Types.ObjectId} organizationId
 * @param {Object} updates
 */
async function updateOrganization(projectId, organizationId, updates) {
  if (!organizationId) return null;
  let oid = organizationId;
  if (typeof organizationId === 'string' && /^[a-fA-F0-9]{24}$/.test(organizationId)) {
    oid = new mongoose.Types.ObjectId(organizationId);
  }
  return Organization.findOneAndUpdate(
    { _id: oid, projectId, ...NOT_DELETED },
    {
      $set: {
        ...(updates.name != null && { name: updates.name }),
        ...(updates.domain !== undefined && { domain: updates.domain }),
        ...(updates.metadata !== undefined && { metadata: updates.metadata }),
        ...(updates.customFields !== undefined && { customFields: updates.customFields }),
      },
    },
    { new: true },
  ).lean();
}

/**
 * @param {string} projectId
 * @param {string|import('mongoose').Types.ObjectId} organizationId
 */
async function getOrganizationById(projectId, organizationId) {
  if (!organizationId) return null;
  // Coerce to ObjectId for consistent lookup (handles string from JSON response)
  let oid = organizationId;
  if (typeof organizationId === 'string' && /^[a-fA-F0-9]{24}$/.test(organizationId)) {
    oid = new mongoose.Types.ObjectId(organizationId);
  }
  return Organization.findOne({ _id: oid, projectId, ...NOT_DELETED }).lean();
}

/**
 * @param {string} projectId
 * @param {Object} [opts]
 * @param {string} [opts.query] - Search by name (case-insensitive partial match)
 * @param {number} [opts.limit]
 * @param {number} [opts.skip]
 */
async function listOrganizations(projectId, opts = {}) {
  const { query: queryParam, limit = 50, skip = 0 } = opts;
  const query = { projectId, ...NOT_DELETED };
  if (queryParam && typeof queryParam === 'string' && queryParam.trim()) {
    const escaped = escapeRegex(queryParam.trim());
    query.name = { $regex: escaped, $options: 'i' };
  }
  return Organization.find(query).sort({ name: 1 }).skip(skip).limit(limit).lean();
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
