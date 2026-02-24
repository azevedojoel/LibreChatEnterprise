/**
 * Contact service - CRUD operations for CRM contacts.
 */
const mongoose = require('mongoose');
const dbModels = require('~/db/models');
const { createActivity, touchContactLastActivity } = require('./activityLogger');

const Contact = dbModels.Contact;

const NOT_DELETED = { $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }] };

/**
 * @param {Object} params
 * @param {string} params.projectId
 * @param {Object} params.data
 * @param {string} params.data.name
 * @param {string} [params.data.email]
 * @param {string} [params.data.phone]
 * @param {string[]} [params.data.tags]
 * @param {string} [params.data.source]
 * @param {string} [params.data.status] - lead | prospect | customer
 * @param {string} params.data.ownerType - user | agent
 * @param {string} params.data.ownerId
 * @param {string} [params.data.organizationId]
 * @param {string} [params.actorId] - For activity log (agentId or userId)
 * @param {string} [params.actorType] - 'user' | 'agent'
 * @param {string} [params.toolName]
 * @param {string} [params.conversationId]
 * @param {string} [params.messageId]
 */
async function createContact({ projectId, data, actorId, actorType = 'agent', toolName, conversationId, messageId }) {
  const contact = await Contact.create({
    projectId,
    name: data.name,
    email: data.email,
    phone: data.phone,
    tags: data.tags || [],
    source: data.source || 'agent',
    status: data.status || 'lead',
    ownerType: data.ownerType,
    ownerId: data.ownerId,
    organizationId: data.organizationId,
  });

  if (actorId) {
    await createActivity({
      projectId,
      contactId: contact._id,
      type: 'contact_created',
      actorType,
      actorId,
      conversationId,
      messageId,
      toolName,
      summary: `Contact created: ${data.name}`,
    });
    await touchContactLastActivity(contact._id);
  }

  return typeof contact.toObject === 'function' ? contact.toObject() : contact;
}

/**
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} params.contactId
 * @param {Object} params.updates - Fields to update
 * @param {string} [params.actorId]
 * @param {string} [params.actorType]
 * @param {string} [params.toolName]
 * @param {string} [params.conversationId]
 * @param {string} [params.messageId]
 */
async function updateContact({ projectId, contactId, updates, actorId, actorType = 'agent', toolName, conversationId, messageId }) {
  const contact = await Contact.findOneAndUpdate(
    { _id: contactId, projectId, ...NOT_DELETED },
    {
      $set: {
        ...(updates.name != null && { name: updates.name }),
        ...(updates.email !== undefined && { email: updates.email }),
        ...(updates.phone !== undefined && { phone: updates.phone }),
        ...(updates.tags !== undefined && { tags: updates.tags }),
        ...(updates.source !== undefined && { source: updates.source }),
        ...(updates.status !== undefined && { status: updates.status }),
        ...(updates.ownerType !== undefined && { ownerType: updates.ownerType }),
        ...(updates.ownerId !== undefined && { ownerId: updates.ownerId }),
        ...(updates.organizationId !== undefined && { organizationId: updates.organizationId }),
      },
    },
    { new: true },
  ).lean();

  if (contact && actorId) {
    await createActivity({
      projectId,
      contactId: contact._id,
      type: 'contact_updated',
      actorType,
      actorId,
      conversationId,
      messageId,
      toolName,
      summary: `Contact updated: ${contact.name}`,
      metadata: { updatedFields: Object.keys(updates) },
    });
    await touchContactLastActivity(contact._id);
  }

  return contact;
}

/**
 * @param {string} projectId
 * @param {string} contactId
 */
async function getContactById(projectId, contactId) {
  return Contact.findOne({ _id: contactId, projectId, ...NOT_DELETED }).lean();
}

/**
 * @param {string} projectId
 * @param {string} email
 */
async function getContactByEmail(projectId, email) {
  return Contact.findOne({ projectId, email: email?.toLowerCase?.() || email, ...NOT_DELETED }).lean();
}

function escapeRegex(str = '') {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} projectId
 * @param {string} name
 * @param {number} [limit]
 */
async function findContactsByName(projectId, name, limit = 10) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    return [];
  }
  const escaped = escapeRegex(name.trim());
  const query = { projectId, name: { $regex: escaped, $options: 'i' }, ...NOT_DELETED };
  return Contact.find(query)
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();
}

/**
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} [params.status] - lead | prospect | customer
 * @param {string[]} [params.tags]
 * @param {number} [params.noActivitySinceDays] - Contacts with no activity in last N days
 * @param {number} [params.limit]
 * @param {number} [params.skip]
 */
async function listContacts({ projectId, status, tags, noActivitySinceDays, limit = 50, skip = 0 }) {
  const query = { projectId, ...NOT_DELETED };

  if (status) {
    query.status = status;
  }

  if (tags && tags.length > 0) {
    query.tags = { $in: tags };
  }

  if (noActivitySinceDays != null && noActivitySinceDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - noActivitySinceDays);
    query.$and = [
      ...(query.$and || []),
      {
        $or: [
          { lastActivityAt: { $lt: cutoff } },
          { lastActivityAt: { $exists: false } },
          { lastActivityAt: null },
        ],
      },
    ];
  }

  const contacts = await Contact.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean();
  return contacts;
}

/**
 * @param {string} projectId
 * @param {string} contactId
 */
async function softDeleteContact(projectId, contactId) {
  const contact = await Contact.findOneAndUpdate(
    { _id: contactId, projectId, ...NOT_DELETED },
    { $set: { deletedAt: new Date() } },
    { new: true },
  ).lean();
  return contact;
}

module.exports = {
  createContact,
  updateContact,
  getContactById,
  getContactByEmail,
  findContactsByName,
  listContacts,
  softDeleteContact,
};
