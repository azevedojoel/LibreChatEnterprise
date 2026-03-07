/**
 * List agents a user can access (ACL-aware). Reusable by HTTP handlers and tools.
 *
 * @param {Object} params
 * @param {string} params.userId - User ID
 * @param {string} params.role - User role
 * @param {string} [params.search] - Filter by name/description (regex)
 * @param {number} [params.limit] - Page size (default 25, max 50)
 * @param {string} [params.after] - Cursor for pagination
 * @param {string} [params.category] - Filter by category
 * @param {boolean} [params.promoted] - Filter promoted agents (1/0)
 * @returns {Promise<{ data: Array<{ id: string; name: string; description?: string }>; has_more: boolean; after?: string }>}
 */
const mongoose = require('mongoose');
const { PermissionBits, ResourceType } = require('librechat-data-provider');
const { findAccessibleResources, findPubliclyAccessibleResources } = require('~/server/services/PermissionService');
const { getListAgentsByAccess } = require('~/models/Agent');

const MAX_SEARCH_LEN = 100;
const escapeRegex = (str = '') => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function listAgentsForUser({ userId, role, search, limit = 25, after, category, promoted }) {
  const filter = {};

  if (category !== undefined && typeof category === 'string' && category.trim() !== '') {
    filter.category = category;
  }

  if (promoted === true || promoted === '1') {
    filter.is_promoted = true;
  } else if (promoted === false || promoted === '0') {
    filter.is_promoted = { $ne: true };
  }

  if (search && typeof search === 'string' && search.trim() !== '') {
    const safeSearch = escapeRegex(search.trim().slice(0, MAX_SEARCH_LEN));
    filter.$or = [{ name: new RegExp(safeSearch, 'i') }, { description: new RegExp(safeSearch, 'i') }];
  }

  const accessibleIds = await findAccessibleResources({
    userId,
    role,
    resourceType: ResourceType.AGENT,
    requiredPermissions: PermissionBits.VIEW,
  });

  const publiclyAccessibleIds = await findPubliclyAccessibleResources({
    resourceType: ResourceType.AGENT,
    requiredPermissions: PermissionBits.VIEW,
  });

  const allAccessibleIds = [
    ...new Set([
      ...accessibleIds.map((id) => id.toString()),
      ...publiclyAccessibleIds.map((id) => id.toString()),
    ]),
  ].map((idStr) => new mongoose.Types.ObjectId(idStr));

  const normalizedLimit = Math.min(Math.max(1, parseInt(limit, 10) || 25), 50);

  const result = await getListAgentsByAccess({
    accessibleIds: allAccessibleIds,
    otherParams: filter,
    limit: normalizedLimit,
    after: after || null,
  });

  const data = (result?.data ?? []).map((a) => ({
    id: a.id,
    name: a.name ?? 'Unnamed',
    description: a.description ?? '',
  }));

  return {
    data,
    has_more: result?.has_more ?? false,
    after: result?.after ?? null,
  };
}

module.exports = { listAgentsForUser };
