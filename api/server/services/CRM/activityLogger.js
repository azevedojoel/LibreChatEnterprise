/**
 * Activity logger - creates Activity records for CRM audit trail.
 * Used by CRM tools when they perform write operations.
 */
const dbModels = require('~/db/models');

/**
 * @param {Object} params
 * @param {string} params.projectId - Project ID (ObjectId or string)
 * @param {string} [params.contactId] - Contact ID
 * @param {string} [params.dealId] - Deal ID
 * @param {import('~/types/activity').ActivityType} params.type - Activity type
 * @param {'user'|'agent'} params.actorType - Who performed the action
 * @param {string} params.actorId - User ID or Agent ID
 * @param {string} [params.conversationId]
 * @param {string} [params.messageId]
 * @param {string} [params.toolName]
 * @param {string} [params.summary]
 * @param {Record<string, unknown>} [params.metadata]
 * @returns {Promise<import('mongoose').Document>}
 */
async function createActivity(params) {
  const Activity = dbModels.Activity;
  if (!Activity) {
    throw new Error('Activity model not found');
  }

  const doc = await Activity.create({
    projectId: params.projectId,
    contactId: params.contactId,
    dealId: params.dealId,
    type: params.type,
    actorType: params.actorType,
    actorId: params.actorId,
    conversationId: params.conversationId,
    messageId: params.messageId,
    toolName: params.toolName,
    summary: params.summary,
    metadata: params.metadata,
  });

  return doc;
}

/**
 * Update lastActivityAt on a contact.
 * @param {string|import('mongoose').Types.ObjectId} contactId
 */
async function touchContactLastActivity(contactId) {
  const Contact = dbModels.Contact;
  if (!Contact) return;
  await Contact.updateOne({ _id: contactId }, { lastActivityAt: new Date() });
}

module.exports = {
  createActivity,
  touchContactLastActivity,
};
