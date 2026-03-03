/**
 * CRM data deletion - Permanently delete all CRM data for a project (GDPR compliant).
 * Uses hard delete (deleteMany), not soft delete.
 */
const mongoose = require('mongoose');
const dbModels = require('~/db/models');

const { Activity, Deal, Contact, Organization, Pipeline } = dbModels;

/**
 * Permanently delete all CRM data for a project (hard delete, GDPR compliant).
 * Deletes: Activity, Deal, Contact, Organization, Pipeline (in dependency order).
 * Does NOT delete the Project record.
 *
 * @param {string} projectId - Project ID (ObjectId string)
 * @returns {Promise<{ activities: number, deals: number, contacts: number, organizations: number, pipelines: number }>}
 */
async function deleteAllCRMDataForProject(projectId) {
  const objId = new mongoose.Types.ObjectId(projectId);
  const query = { projectId: objId };

  const [activities, deals, contacts, organizations, pipelines] = await Promise.all([
    Activity.deleteMany(query),
    Deal.deleteMany(query),
    Contact.deleteMany(query),
    Organization.deleteMany(query),
    Pipeline.deleteMany(query),
  ]);

  return {
    activities: activities.deletedCount,
    deals: deals.deletedCount,
    contacts: contacts.deletedCount,
    organizations: organizations.deletedCount,
    pipelines: pipelines.deletedCount,
  };
}

module.exports = {
  deleteAllCRMDataForProject,
};
