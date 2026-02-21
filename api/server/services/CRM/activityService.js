/**
 * Activity service - Read operations for CRM activity/timeline.
 */
const dbModels = require('~/db/models');

const Activity = dbModels.Activity;

/**
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} [params.contactId]
 * @param {string} [params.dealId]
 * @param {number} [params.limit]
 * @param {number} [params.skip]
 */
async function listActivities({ projectId, contactId, dealId, limit = 50, skip = 0 }) {
  const query = { projectId };
  if (contactId) query.contactId = contactId;
  if (dealId) query.dealId = dealId;

  return Activity.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
}

/**
 * @param {string} projectId
 * @param {string} activityId
 */
async function getActivityById(projectId, activityId) {
  return Activity.findOne({ _id: activityId, projectId }).lean();
}

module.exports = {
  listActivities,
  getActivityById,
};
