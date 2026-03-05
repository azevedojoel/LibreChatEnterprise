const mongoose = require('mongoose');
const { UserProject, ProjectContextSection } = require('~/db/models');
const { verifyProjectOwnership } = require('./projectLogService');

const MAX_CONTENT_LENGTH = 50 * 1024; // 50KB per section

/**
 * Get sections for a project.
 * @param {string} projectId - Project ID
 * @param {string} userId - User ID
 * @returns {Promise<Array<{ sectionId: string, title: string, content: string, order: number }>>}
 */
const getSections = async (projectId, userId) => {
  const owns = await verifyProjectOwnership(projectId, userId);
  if (!owns) {
    throw new Error('Project not found or access denied');
  }
  const sections = await ProjectContextSection.find({
    projectId: new mongoose.Types.ObjectId(projectId),
  })
    .sort({ order: 1, createdAt: 1 })
    .select('sectionId title content order')
    .lean();
  return sections;
};

/**
 * Format sections for injection into the agent prompt.
 * @param {Array<{ sectionId: string, title: string, content: string }>} sections
 * @returns {string}
 */
const formatContextForPrompt = (sections) => {
  if (!sections || sections.length === 0) {
    return '';
  }
  return sections
    .map((s) => `# ${s.title} (id=${s.sectionId})\n${(s.content || '').trim()}`)
    .join('\n\n');
};

/**
 * Get formatted context for a project (for agent prompt injection).
 * @param {string} projectId - Project ID
 * @param {string} userId - User ID
 * @returns {Promise<string>}
 */
const getFormattedContext = async (projectId, userId) => {
  const sections = await getSections(projectId, userId);
  return formatContextForPrompt(sections);
};

/**
 * Upsert a section.
 * @param {string} projectId - Project ID
 * @param {string} userId - User ID
 * @param {{ sectionId: string, title: string, content: string }} data
 * @returns {Promise<Object>}
 */
const upsertSection = async (projectId, userId, { sectionId, title, content }) => {
  const owns = await verifyProjectOwnership(projectId, userId);
  if (!owns) {
    throw new Error('Project not found or access denied');
  }
  const trimmedContent = String(content ?? '').slice(0, MAX_CONTENT_LENGTH);
  const trimmedTitle = String(title ?? sectionId ?? 'Section').trim().slice(0, 200);
  const slug = String(sectionId ?? '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 100);
  if (!slug) {
    throw new Error('sectionId is required');
  }
  const pid = new mongoose.Types.ObjectId(projectId);
  const section = await ProjectContextSection.findOneAndUpdate(
    { projectId: pid, sectionId: slug },
    { $set: { title: trimmedTitle, content: trimmedContent } },
    { new: true, upsert: true },
  ).lean();
  return section;
};

/**
 * Patch sections: upsert multiple and optionally delete others in one call.
 * @param {string} projectId - Project ID
 * @param {string} userId - User ID
 * @param {{ sections?: Array<{ sectionId: string, title: string, content: string }>, deleteIds?: string[] }} data
 * @returns {Promise<{ upserted: number, deleted: number, skipped: string[] }>}
 */
const patchSections = async (projectId, userId, { sections = [], deleteIds = [] }) => {
  const owns = await verifyProjectOwnership(projectId, userId);
  if (!owns) {
    throw new Error('Project not found or access denied');
  }
  const pid = new mongoose.Types.ObjectId(projectId);
  const skipped = [];
  let upserted = 0;
  for (const { sectionId, title, content } of sections) {
    const trimmedContent = String(content ?? '').slice(0, MAX_CONTENT_LENGTH);
    const trimmedTitle = String(title ?? sectionId ?? 'Section').trim().slice(0, 200);
    const slug = String(sectionId ?? '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 100);
    if (!slug) {
      skipped.push(String(sectionId ?? '(empty)'));
      continue;
    }
    await ProjectContextSection.findOneAndUpdate(
      { projectId: pid, sectionId: slug },
      { $set: { title: trimmedTitle, content: trimmedContent } },
      { new: true, upsert: true },
    );
    upserted++;
  }
  let deleted = 0;
  for (const sectionId of deleteIds) {
    const slug = String(sectionId ?? '').trim().replace(/\s+/g, '-').toLowerCase();
    if (!slug) {
      skipped.push(String(sectionId ?? '(empty)'));
      continue;
    }
    const result = await ProjectContextSection.deleteOne({ projectId: pid, sectionId: slug });
    if (result.deletedCount > 0) deleted++;
  }
  return { upserted, deleted, skipped };
};

/**
 * Delete a section.
 * @param {string} projectId - Project ID
 * @param {string} userId - User ID
 * @param {string} sectionId - Section ID
 * @returns {Promise<boolean>}
 */
const deleteSection = async (projectId, userId, sectionId) => {
  const owns = await verifyProjectOwnership(projectId, userId);
  if (!owns) {
    throw new Error('Project not found or access denied');
  }
  const slug = String(sectionId ?? '').trim().replace(/\s+/g, '-').toLowerCase();
  if (!slug) {
    throw new Error('sectionId is required');
  }
  const result = await ProjectContextSection.deleteOne({
    projectId: new mongoose.Types.ObjectId(projectId),
    sectionId: slug,
  });
  return result.deletedCount > 0;
};

module.exports = {
  getSections,
  formatContextForPrompt,
  getFormattedContext,
  upsertSection,
  patchSections,
  deleteSection,
};
