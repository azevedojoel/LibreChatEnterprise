/**
 * Tool Override Service - resolves and applies admin-defined tool definition overwrites.
 * Overrides can be global (agentId null) or agent-specific; agent-specific takes precedence.
 */
const mongoose = require('mongoose');
const { ToolOverride } = require('~/db/models');

/**
 * Get override for a tool. Agent-specific wins over global.
 * @param {string} toolId - Tool identifier (e.g. file_search, gmail_send_mcp_Google)
 * @param {string|import('mongoose').Types.ObjectId|null} agentId - Agent MongoDB _id, or null for global-only lookup
 * @returns {Promise<{ toolId: string, agentId?: import('mongoose').Types.ObjectId|null, description?: string, schema?: object }|null>}
 */
async function getOverride(toolId, agentId) {
  if (!toolId || typeof toolId !== 'string') return null;
  const agentObjId = agentId && mongoose.Types.ObjectId.isValid(agentId)
    ? new mongoose.Types.ObjectId(agentId)
    : null;

  // Agent-specific first (definition overrides only - userId null)
  if (agentObjId) {
    const agentOverride = await ToolOverride.findOne({
      toolId: toolId.trim(),
      agentId: agentObjId,
      userId: null,
    })
      .select('toolId agentId description schema')
      .lean();
    if (agentOverride) return agentOverride;
  }

  // Fall back to global (definition overrides only - userId null)
  const globalOverride = await ToolOverride.findOne({
    toolId: toolId.trim(),
    agentId: null,
    userId: null,
  })
    .select('toolId agentId description schema')
    .lean();
  return globalOverride;
}

/**
 * Get approval override for a tool. Precedence: (agentId, userId) > (agentId, null) > (null, userId) > (null, null).
 * Returns first override where requiresApproval is boolean; else undefined.
 * @param {string} toolId - Tool identifier
 * @param {string|import('mongoose').Types.ObjectId|null} agentId - Agent _id
 * @param {string|import('mongoose').Types.ObjectId|null} userId - User _id (conversation owner)
 * @returns {Promise<boolean|undefined>}
 */
async function getApprovalOverride(toolId, agentId, userId) {
  if (!toolId || typeof toolId !== 'string') return undefined;
  const agentObjId =
    agentId && mongoose.Types.ObjectId.isValid(agentId)
      ? new mongoose.Types.ObjectId(agentId)
      : null;
  const userObjId =
    userId && mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : null;

  const candidates = [
    { agentId: agentObjId, userId: userObjId },
    { agentId: agentObjId, userId: null },
    { agentId: null, userId: userObjId },
    { agentId: null, userId: null },
  ];

  for (const c of candidates) {
    const override = await ToolOverride.findOne({
      toolId: toolId.trim(),
      agentId: c.agentId,
      userId: c.userId,
      requiresApproval: { $in: [true, false] },
    })
      .select('requiresApproval')
      .lean();
    if (override && typeof override.requiresApproval === 'boolean') {
      return override.requiresApproval;
    }
  }
  return undefined;
}

/**
 * Apply an override to a base tool definition.
 * Override description replaces base; override schema fully replaces base parameters.
 * @param {Object} baseDef - Base definition: { name, description?, parameters? }
 * @param {Object} override - Override: { description?, schema? }
 * @returns {Object} Merged definition (mutates baseDef-like shape)
 */
function applyOverride(baseDef, override) {
  if (!override) return { ...baseDef };
  const result = { ...baseDef };
  if (override.description != null && override.description !== '') {
    result.description = override.description;
  }
  if (override.schema != null && typeof override.schema === 'object') {
    result.parameters = override.schema;
  }
  return result;
}

/**
 * Apply tool overrides to toolDefinitions and toolRegistry.
 * @param {Object} params
 * @param {Array<{ name: string, description?: string, parameters?: object }>} params.toolDefinitions
 * @param {Map<string, { name: string, description?: string, parameters?: object }>} params.toolRegistry
 * @param {string|import('mongoose').Types.ObjectId|null} params.agentId - Agent _id for override lookup
 * @returns {Promise<{ toolDefinitions: Array, toolRegistry: Map }>}
 */
async function applyToolOverrides({ toolDefinitions, toolRegistry }, agentId) {
  if (!toolDefinitions?.length && (!toolRegistry || toolRegistry.size === 0)) {
    return { toolDefinitions: toolDefinitions ?? [], toolRegistry: toolRegistry ?? new Map() };
  }

  const defs = Array.isArray(toolDefinitions) ? [...toolDefinitions] : [];
  const registry = toolRegistry instanceof Map ? new Map(toolRegistry) : new Map();

  const toolNames = new Set([
    ...defs.map((d) => d?.name).filter(Boolean),
    ...registry.keys(),
  ]);

  for (const name of toolNames) {
    const override = await getOverride(name, agentId);
    if (!override) continue;

    const baseFromDef = defs.find((d) => d?.name === name);
    const baseFromReg = registry.get(name);
    const base = baseFromDef ?? baseFromReg ?? { name };
    const merged = applyOverride(base, override);

    if (baseFromDef) {
      const idx = defs.findIndex((d) => d?.name === name);
      if (idx >= 0) defs[idx] = merged;
    }
    if (registry.has(name)) {
      registry.set(name, { ...registry.get(name), ...merged });
    }
  }

  return { toolDefinitions: defs, toolRegistry: registry };
}

/**
 * List overrides with optional filters.
 * @param {Object} filters
 * @param {string} [filters.toolId]
 * @param {string} [filters.agentId]
 * @param {string} [filters.userId]
 * @param {boolean} [filters.globalOnly] - If true, only return overrides with agentId null
 * @param {number} [filters.limit=50]
 * @param {number} [filters.page=1]
 * @returns {Promise<{ overrides: Array, total: number, page: number, limit: number }>}
 */
async function listOverrides(filters = {}) {
  const { toolId, agentId, userId, globalOnly, limit = 50, page = 1 } = filters;
  const query = {};
  if (toolId && String(toolId).trim()) query.toolId = String(toolId).trim();
  if (globalOnly === true) query.agentId = null;
  else if (agentId && mongoose.Types.ObjectId.isValid(agentId)) {
    query.agentId = new mongoose.Types.ObjectId(agentId);
  }
  if (userId !== undefined && userId !== null) {
    if (mongoose.Types.ObjectId.isValid(userId)) {
      query.userId = new mongoose.Types.ObjectId(userId);
    } else if (userId === '') {
      query.userId = null;
    }
  }

  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * limitNum;

  const [overrides, total] = await Promise.all([
    ToolOverride.find(query).sort({ toolId: 1, agentId: 1, userId: 1 }).skip(skip).limit(limitNum).lean(),
    ToolOverride.countDocuments(query),
  ]);

  return {
    overrides: overrides.map((o) => ({
      _id: o._id?.toString(),
      toolId: o.toolId,
      agentId: o.agentId?.toString() ?? null,
      userId: o.userId?.toString() ?? null,
      description: o.description,
      schema: o.schema,
      requiresApproval: o.requiresApproval,
      createdBy: o.createdBy?.toString(),
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    })),
    total,
    page: Math.floor(skip / limitNum) + 1,
    limit: limitNum,
  };
}

/**
 * Create a tool override.
 * @param {Object} data - { toolId, agentId?, userId?, description?, schema?, requiresApproval?, createdBy }
 * @returns {Promise<Object>} Created override
 */
async function createOverride(data) {
  const { toolId, agentId, userId, description, schema, requiresApproval, createdBy } = data;
  if (!toolId || typeof toolId !== 'string') {
    throw new Error('toolId is required');
  }
  if (!createdBy) throw new Error('createdBy is required');

  const agentObjId =
    agentId && mongoose.Types.ObjectId.isValid(agentId)
      ? new mongoose.Types.ObjectId(agentId)
      : null;
  const userObjId =
    userId && mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : null;

  const doc = await ToolOverride.create({
    toolId: toolId.trim(),
    agentId: agentObjId,
    userId: userObjId,
    description: description ?? null,
    schema: schema ?? null,
    requiresApproval:
      requiresApproval === true || requiresApproval === false ? requiresApproval : null,
    createdBy,
  });
  return doc.toObject();
}

/**
 * Get override by _id or by (toolId, agentId?, userId?). Returns full document including _id.
 * @param {Object} params - { overrideId } or { toolId, agentId?, userId? }
 * @returns {Promise<Object|null>}
 */
async function getOverrideById(params) {
  const { overrideId, toolId, agentId, userId } = params;
  if (overrideId && mongoose.Types.ObjectId.isValid(overrideId)) {
    return ToolOverride.findById(overrideId).lean();
  }
  if (toolId) {
    const agentObjId =
      agentId && mongoose.Types.ObjectId.isValid(agentId)
        ? new mongoose.Types.ObjectId(agentId)
        : null;
    const userObjId =
      userId && mongoose.Types.ObjectId.isValid(userId)
        ? new mongoose.Types.ObjectId(userId)
        : null;
    const doc = await ToolOverride.findOne({
      toolId: toolId.trim(),
      agentId: agentObjId,
      userId: userObjId,
    }).lean();
    return doc;
  }
  return null;
}

/**
 * Update an override by _id.
 * @param {string} overrideId
 * @param {Object} updates - { description?, schema?, requiresApproval? }
 * @returns {Promise<Object|null>}
 */
async function updateOverride(overrideId, updates) {
  if (!overrideId || !mongoose.Types.ObjectId.isValid(overrideId)) return null;
  const { description, schema, requiresApproval } = updates;
  const update = {};
  if (description !== undefined) update.description = description ?? null;
  if (schema !== undefined) update.schema = schema ?? null;
  if (requiresApproval === true || requiresApproval === false) {
    update.requiresApproval = requiresApproval;
  } else if (requiresApproval !== undefined) {
    update.requiresApproval = null;
  }
  const doc = await ToolOverride.findByIdAndUpdate(overrideId, update, { new: true }).lean();
  return doc;
}

/**
 * Delete an override by _id or by (toolId, agentId?, userId?).
 * @param {Object} params - { overrideId } or { toolId, agentId?, userId? }
 * @returns {Promise<{ deleted: boolean, error?: string }>}
 */
async function deleteOverride(params) {
  const { overrideId, toolId, agentId, userId } = params;
  if (overrideId && mongoose.Types.ObjectId.isValid(overrideId)) {
    const result = await ToolOverride.findByIdAndDelete(overrideId);
    return { deleted: !!result };
  }
  if (toolId) {
    const agentObjId =
      agentId && mongoose.Types.ObjectId.isValid(agentId)
        ? new mongoose.Types.ObjectId(agentId)
        : null;
    const userObjId =
      userId && mongoose.Types.ObjectId.isValid(userId)
        ? new mongoose.Types.ObjectId(userId)
        : null;
    const result = await ToolOverride.findOneAndDelete({
      toolId: toolId.trim(),
      agentId: agentObjId,
      userId: userObjId,
    });
    return { deleted: !!result };
  }
  return { deleted: false, error: 'overrideId or toolId required' };
}

module.exports = {
  getOverride,
  getApprovalOverride,
  applyOverride,
  applyToolOverrides,
  listOverrides,
  createOverride,
  getOverrideById,
  updateOverride,
  deleteOverride,
};
