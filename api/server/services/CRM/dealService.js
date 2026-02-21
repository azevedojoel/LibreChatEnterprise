/**
 * Deal service - CRUD operations for CRM deals/opportunities.
 */
const dbModels = require('~/db/models');
const { createActivity } = require('./activityLogger');

const Deal = dbModels.Deal;
const Pipeline = dbModels.Pipeline;

/**
 * @param {Object} params
 * @param {string} params.projectId
 * @param {Object} params.data
 * @param {string} params.data.pipelineId
 * @param {string} params.data.stage
 * @param {string} [params.data.contactId]
 * @param {string} [params.data.organizationId]
 * @param {number} [params.data.value]
 * @param {string|Date} [params.data.expectedCloseDate]
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
    contactId: data.contactId,
    organizationId: data.organizationId,
    value: data.value,
    expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : undefined,
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

  return typeof deal.toObject === 'function' ? deal.toObject() : deal;
}

/**
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} params.dealId
 * @param {Object} params.updates - stage, contactId, organizationId, value, expectedCloseDate, ownerType, ownerId
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
  if (updates.contactId !== undefined) setFields.contactId = updates.contactId;
  if (updates.organizationId !== undefined) setFields.organizationId = updates.organizationId;
  if (updates.value !== undefined) setFields.value = updates.value;
  if (updates.expectedCloseDate !== undefined)
    setFields.expectedCloseDate = updates.expectedCloseDate ? new Date(updates.expectedCloseDate) : null;
  if (updates.ownerType !== undefined) setFields.ownerType = updates.ownerType;
  if (updates.ownerId !== undefined) setFields.ownerId = updates.ownerId;

  const deal = await Deal.findOneAndUpdate({ _id: dealId, projectId }, { $set: setFields }, { new: true }).lean();

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
  return Deal.findOne({ _id: dealId, projectId }).populate('contactId', 'name email').populate('organizationId', 'name').lean();
}

/**
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} [params.pipelineId]
 * @param {string} [params.stage]
 * @param {string} [params.contactId]
 * @param {number} [params.limit]
 * @param {number} [params.skip]
 */
async function listDeals({ projectId, pipelineId, stage, contactId, limit = 50, skip = 0 }) {
  const query = { projectId };
  if (pipelineId) query.pipelineId = pipelineId;
  if (stage) query.stage = stage;
  if (contactId) query.contactId = contactId;

  return Deal.find(query)
    .populate('contactId', 'name email')
    .populate('organizationId', 'name')
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

module.exports = {
  createDeal,
  updateDeal,
  getDealById,
  listDeals,
};
