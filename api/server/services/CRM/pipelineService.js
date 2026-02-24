/**
 * Pipeline service - CRUD operations for CRM pipelines.
 */
const dbModels = require('~/db/models');

const Pipeline = dbModels.Pipeline;
const Deal = dbModels.Deal;

const NOT_DELETED = { $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }] };

/**
 * @param {Object} params
 * @param {string} params.projectId
 * @param {Object} params.data
 * @param {string} params.data.name
 * @param {string[]} params.data.stages
 * @param {boolean} [params.data.isDefault]
 */
async function createPipeline({ projectId, data }) {
  const isDefault = data.isDefault ?? false;

  if (isDefault) {
    await Pipeline.updateMany({ projectId, ...NOT_DELETED }, { $set: { isDefault: false } });
  }

  const pipeline = await Pipeline.create({
    projectId,
    name: data.name,
    stages: data.stages,
    isDefault,
  });
  return typeof pipeline.toObject === 'function' ? pipeline.toObject() : pipeline;
}

/**
 * @param {string} projectId
 * @param {string} pipelineId
 * @param {Object} updates - name, stages, isDefault
 */
async function updatePipeline(projectId, pipelineId, updates) {
  if (updates.isDefault) {
    await Pipeline.updateMany({ projectId, ...NOT_DELETED }, { $set: { isDefault: false } });
  }

  const setFields = {};
  if (updates.name != null) setFields.name = updates.name;
  if (updates.stages !== undefined) setFields.stages = updates.stages;
  if (updates.isDefault !== undefined) setFields.isDefault = updates.isDefault;

  return Pipeline.findOneAndUpdate(
    { _id: pipelineId, projectId, ...NOT_DELETED },
    { $set: setFields },
    { new: true },
  ).lean();
}

/**
 * @param {string} projectId
 * @param {string} pipelineId
 */
async function getPipelineById(projectId, pipelineId) {
  return Pipeline.findOne({ _id: pipelineId, projectId, ...NOT_DELETED }).lean();
}

/**
 * @param {string} projectId
 */
async function listPipelines(projectId) {
  return Pipeline.find({ projectId, ...NOT_DELETED }).sort({ isDefault: -1, name: 1 }).lean();
}

/**
 * @param {string} projectId
 */
async function getDefaultPipeline(projectId) {
  let pipeline = await Pipeline.findOne({ projectId, isDefault: true, ...NOT_DELETED }).lean();
  if (!pipeline) {
    pipeline = await Pipeline.findOne({ projectId, ...NOT_DELETED }).sort({ createdAt: 1 }).lean();
  }
  return pipeline;
}

/**
 * @param {string} projectId
 * @param {string} pipelineId
 * @returns {Promise<Object|null>} The soft-deleted pipeline, or null if not found or if deals exist
 */
async function softDeletePipeline(projectId, pipelineId) {
  const activeDeals = await Deal.countDocuments({
    projectId,
    pipelineId,
    ...NOT_DELETED,
  });
  if (activeDeals > 0) {
    throw new Error(
      `Cannot delete pipeline: ${activeDeals} deal(s) still exist in this pipeline. Move or delete deals first.`,
    );
  }
  return Pipeline.findOneAndUpdate(
    { _id: pipelineId, projectId, ...NOT_DELETED },
    { $set: { deletedAt: new Date() } },
    { new: true },
  ).lean();
}

module.exports = {
  createPipeline,
  updatePipeline,
  getPipelineById,
  listPipelines,
  getDefaultPipeline,
  softDeletePipeline,
};
