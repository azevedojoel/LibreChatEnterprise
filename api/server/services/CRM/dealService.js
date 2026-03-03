/**
 * Deal service - CRUD operations for CRM deals/opportunities.
 */
const dbModels = require('~/db/models');
const { createActivity } = require('./activityLogger');

const Deal = dbModels.Deal;
const Pipeline = dbModels.Pipeline;

const NOT_DELETED = { $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }] };

/**
 * @param {Object} params
 * @param {string} params.projectId
 * @param {Object} params.data
 * @param {string} params.data.pipelineId
 * @param {string} params.data.stage
 * @param {string} [params.data.title] - Human-readable deal title (default: Untitled Deal)
 * @param {string} [params.data.description] - Additional context/notes
 * @param {string} [params.data.contactId]
 * @param {string} [params.data.organizationId]
 * @param {number} [params.data.value]
 * @param {string|Date} [params.data.expectedCloseDate]
 * @param {number} [params.data.probability] - Win probability 0-100%
 * @param {Record<string, string|number|boolean>} [params.data.customFields]
 * @param {string} params.data.ownerType
 * @param {string} params.data.ownerId
 * @param {string} [params.actorId]
 * @param {string} [params.actorType]
 * @param {string} [params.toolName]
 * @param {string} [params.conversationId]
 * @param {string} [params.messageId]
 */
async function createDeal({ projectId, data, actorId, actorType = 'agent', toolName, conversationId, messageId }) {
  const deal = await Deal.create({
    projectId,
    pipelineId: data.pipelineId,
    stage: data.stage,
    title: data.title || 'Untitled Deal',
    description: data.description,
    contactId: data.contactId,
    organizationId: data.organizationId,
    value: data.value,
    expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : undefined,
    probability: data.probability,
    customFields: data.customFields,
    ownerType: data.ownerType,
    ownerId: data.ownerId,
  });

  if (actorId) {
    await createActivity({
      projectId,
      contactId: data.contactId,
      dealId: deal._id,
      type: 'deal_created',
      actorType,
      actorId,
      conversationId,
      messageId,
      toolName,
      summary: `Deal created in stage: ${data.stage}`,
    });
  }

  const obj = typeof deal.toObject === 'function' ? deal.toObject() : deal;
  if (obj && obj._id) {
    obj.id = obj._id?.toString?.() ?? obj._id;
  }
  return obj;
}

/**
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} params.dealId
 * @param {Object} params.updates - stage, title, description, contactId, organizationId, value, expectedCloseDate, probability, customFields, ownerType, ownerId
 * @param {string} [params.previousStage] - For stage_change activity
 * @param {string} [params.actorId]
 * @param {string} [params.actorType]
 * @param {string} [params.toolName]
 * @param {string} [params.conversationId]
 * @param {string} [params.messageId]
 */
async function updateDeal({
  projectId,
  dealId,
  updates,
  previousStage,
  actorId,
  actorType = 'agent',
  toolName,
  conversationId,
  messageId,
}) {
  const setFields = {};
  if (updates.stage != null) setFields.stage = updates.stage;
  if (updates.title !== undefined) setFields.title = updates.title;
  if (updates.description !== undefined) setFields.description = updates.description;
  if (updates.contactId !== undefined) setFields.contactId = updates.contactId;
  if (updates.organizationId !== undefined) setFields.organizationId = updates.organizationId;
  if (updates.value !== undefined) setFields.value = updates.value;
  if (updates.expectedCloseDate !== undefined)
    setFields.expectedCloseDate = updates.expectedCloseDate ? new Date(updates.expectedCloseDate) : null;
  if (updates.probability !== undefined) setFields.probability = updates.probability;
  if (updates.customFields !== undefined) setFields.customFields = updates.customFields;
  if (updates.ownerType !== undefined) setFields.ownerType = updates.ownerType;
  if (updates.ownerId !== undefined) setFields.ownerId = updates.ownerId;

  const deal = await Deal.findOneAndUpdate(
    { _id: dealId, projectId, ...NOT_DELETED },
    { $set: setFields },
    { new: true },
  ).lean();

  if (deal && actorId) {
    const activityType = updates.stage != null && previousStage !== updates.stage ? 'stage_change' : 'deal_updated';
    await createActivity({
      projectId,
      contactId: deal.contactId,
      dealId: deal._id,
      type: activityType,
      actorType,
      actorId,
      conversationId,
      messageId,
      toolName,
      summary:
        activityType === 'stage_change'
          ? `Deal moved from ${previousStage || 'unknown'} to ${updates.stage}`
          : `Deal updated`,
      metadata: activityType === 'stage_change' ? { fromStage: previousStage, toStage: updates.stage } : undefined,
    });
  }

  return deal;
}

/**
 * @param {string} projectId
 * @param {string} dealId
 */
async function getDealById(projectId, dealId) {
  return Deal.findOne({ _id: dealId, projectId, ...NOT_DELETED })
    .populate('contactId', 'name email')
    .populate('organizationId', 'name')
    .lean();
}

/**
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} [params.pipelineId]
 * @param {string} [params.stage]
 * @param {string} [params.contactId]
 * @param {string} [params.query] - Search by title or description (case-insensitive partial match)
 * @param {number} [params.limit]
 * @param {number} [params.skip]
 */
async function listDeals({ projectId, pipelineId, stage, contactId, query: queryParam, limit = 50, skip = 0 }) {
  const query = { projectId, ...NOT_DELETED };
  if (pipelineId) query.pipelineId = pipelineId;
  if (stage) query.stage = stage;
  if (contactId) query.contactId = contactId;

  if (queryParam && typeof queryParam === 'string' && queryParam.trim()) {
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escaped = escapeRegex(queryParam.trim());
    const regex = { $regex: escaped, $options: 'i' };
    query.$or = [{ title: regex }, { description: regex }];
  }

  return Deal.find(query)
    .populate('contactId', 'name email')
    .populate('organizationId', 'name')
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

/**
 * @param {string} projectId
 * @param {string} dealId
 */
async function softDeleteDeal(projectId, dealId) {
  return Deal.findOneAndUpdate(
    { _id: dealId, projectId, ...NOT_DELETED },
    { $set: { deletedAt: new Date() } },
    { new: true },
  ).lean();
}

module.exports = {
  createDeal,
  updateDeal,
  getDealById,
  listDeals,
  softDeleteDeal,
};
