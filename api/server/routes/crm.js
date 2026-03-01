/**
 * CRM REST API - Native CRM for DailyThread.
 * All routes are scoped by projectId. User must have projectId assigned (or be ADMIN).
 */
const express = require('express');
const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');
const { requireJwtAuth } = require('~/server/middleware');
const { getProjectById, listProjects, createProject } = require('~/models/Project');
const { findUser } = require('~/models');
const {
  createContact,
  updateContact,
  getContactById,
  getContactByEmail,
  findContactsByName,
  listContacts,
  softDeleteContact,
  createOrganization,
  updateOrganization,
  getOrganizationById,
  listOrganizations,
  softDeleteOrganization,
  createDeal,
  updateDeal,
  getDealById,
  listDeals,
  softDeleteDeal,
  listActivities,
  createPipeline,
  updatePipeline,
  getPipelineById,
  listPipelines,
  softDeletePipeline,
  createActivity,
  touchContactLastActivity,
} = require('~/server/services/CRM');

const router = express.Router();

/**
 * Verifies user has access to the project for CRM operations.
 * User has access if user.projectId matches the requested projectId, or user is ADMIN.
 */
async function canAccessProjectForCRM(userId, role, projectId) {
  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    return false;
  }
  const project = await getProjectById(projectId);
  if (!project) return false;

  if (role === SystemRoles.ADMIN) {
    return true;
  }

  const user = await findUser({ _id: userId }, 'projectId');
  if (!user) return false;
  const userProjectId = user.projectId?.toString?.() ?? user.projectId;
  return userProjectId === projectId;
}

/** Middleware: require projectId and verify access */
const requireProjectAccess = async (req, res, next) => {
  const projectId = req.params.projectId ?? req.body?.projectId ?? req.query?.projectId;
  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }
  const hasAccess = await canAccessProjectForCRM(
    req.user.id,
    req.user.role ?? 'USER',
    projectId,
  );
  if (!hasAccess) {
    return res.status(403).json({ error: 'Unable to access CRM data' });
  }
  req.crmProjectId = projectId;
  next();
};

router.use(requireJwtAuth);

// ========== Projects ==========
router.get('/projects', async (req, res) => {
  try {
    const projects = await listProjects();
    res.json(projects);
  } catch (err) {
    logger.error('[CRM] listProjects', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/projects', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Project name is required' });
    }
    const project = await createProject(name);
    res.status(201).json({ _id: project._id.toString(), name: project.name });
  } catch (err) {
    logger.error('[CRM] createProject', err);
    const status = err.message?.includes('reserved') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

router.get('/projects/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    const project = await getProjectById(projectId, ['name']);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ _id: project._id.toString(), name: project.name });
  } catch (err) {
    logger.error('[CRM] getProject', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== Pipelines ==========
router.get('/projects/:projectId/pipelines', requireProjectAccess, async (req, res) => {
  try {
    const pipelines = await listPipelines(req.crmProjectId);
    res.json(pipelines);
  } catch (err) {
    logger.error('[CRM] listPipelines', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/projects/:projectId/pipelines', requireProjectAccess, async (req, res) => {
  try {
    const { name, stages, isDefault } = req.body;
    if (!name || !stages?.length) {
      return res.status(400).json({ error: 'name and stages are required' });
    }
    const pipeline = await createPipeline({
      projectId: req.crmProjectId,
      data: { name, stages, isDefault },
    });
    res.status(201).json(pipeline);
  } catch (err) {
    logger.error('[CRM] createPipeline', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects/:projectId/pipelines/:pipelineId', requireProjectAccess, async (req, res) => {
  try {
    const pipeline = await getPipelineById(req.crmProjectId, req.params.pipelineId);
    if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });
    res.json(pipeline);
  } catch (err) {
    logger.error('[CRM] getPipeline', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/projects/:projectId/pipelines/:pipelineId', requireProjectAccess, async (req, res) => {
  try {
    const pipeline = await updatePipeline(req.crmProjectId, req.params.pipelineId, req.body);
    if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });
    res.json(pipeline);
  } catch (err) {
    logger.error('[CRM] updatePipeline', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/projects/:projectId/pipelines/:pipelineId', requireProjectAccess, async (req, res) => {
  try {
    const pipeline = await softDeletePipeline(req.crmProjectId, req.params.pipelineId);
    if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });
    res.json({ deleted: true, _id: pipeline._id });
  } catch (err) {
    logger.error('[CRM] softDeletePipeline', err);
    const status = err.message?.includes('Cannot delete') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// ========== Contacts ==========
router.get('/projects/:projectId/contacts', requireProjectAccess, async (req, res) => {
  try {
    const { status, tags, noActivitySinceDays, limit, skip } = req.query;
    const contacts = await listContacts({
      projectId: req.crmProjectId,
      status,
      tags: tags ? (Array.isArray(tags) ? tags : tags.split(',')) : undefined,
      noActivitySinceDays: noActivitySinceDays ? parseInt(noActivitySinceDays, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : 50,
      skip: skip ? parseInt(skip, 10) : 0,
    });
    res.json(contacts);
  } catch (err) {
    logger.error('[CRM] listContacts', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/projects/:projectId/contacts', requireProjectAccess, async (req, res) => {
  try {
    const { name, email, phone, tags, source, status, organizationId } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const contact = await createContact({
      projectId: req.crmProjectId,
      data: {
        name,
        email,
        phone,
        tags: tags || [],
        source: source || 'manual',
        status: status || 'lead',
        ownerType: 'user',
        ownerId: req.user.id,
        organizationId,
      },
      actorId: req.user.id,
      actorType: 'user',
    });
    res.status(201).json(contact);
  } catch (err) {
    logger.error('[CRM] createContact', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects/:projectId/contacts/lookup', requireProjectAccess, async (req, res) => {
  try {
    const { email, name } = req.query;
    if (email) {
      const contact = await getContactByEmail(req.crmProjectId, email);
      if (!contact) return res.status(404).json({ error: 'Contact not found' });
      return res.json(contact);
    }
    if (name) {
      const matches = await findContactsByName(req.crmProjectId, name, 1);
      const contact = matches[0] ?? null;
      if (!contact) return res.status(404).json({ error: 'Contact not found' });
      return res.json(contact);
    }
    return res.status(400).json({ error: 'email or name query parameter is required' });
  } catch (err) {
    logger.error('[CRM] contactLookup', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects/:projectId/contacts/:contactId', requireProjectAccess, async (req, res) => {
  try {
    const contact = await getContactById(req.crmProjectId, req.params.contactId);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json(contact);
  } catch (err) {
    logger.error('[CRM] getContact', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/projects/:projectId/contacts/:contactId', requireProjectAccess, async (req, res) => {
  try {
    const contact = await updateContact({
      projectId: req.crmProjectId,
      contactId: req.params.contactId,
      updates: req.body,
      actorId: req.user.id,
      actorType: 'user',
    });
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json(contact);
  } catch (err) {
    logger.error('[CRM] updateContact', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/projects/:projectId/contacts/:contactId', requireProjectAccess, async (req, res) => {
  try {
    const contact = await softDeleteContact(req.crmProjectId, req.params.contactId);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json({ deleted: true, _id: contact._id });
  } catch (err) {
    logger.error('[CRM] softDeleteContact', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== Organizations ==========
router.get('/projects/:projectId/organizations', requireProjectAccess, async (req, res) => {
  try {
    const orgs = await listOrganizations(req.crmProjectId);
    res.json(orgs);
  } catch (err) {
    logger.error('[CRM] listOrganizations', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/projects/:projectId/organizations', requireProjectAccess, async (req, res) => {
  try {
    const { name, domain, metadata } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const org = await createOrganization({
      projectId: req.crmProjectId,
      data: { name, domain, metadata },
    });
    res.status(201).json(org);
  } catch (err) {
    logger.error('[CRM] createOrganization', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects/:projectId/organizations/:organizationId', requireProjectAccess, async (req, res) => {
  try {
    const org = await getOrganizationById(req.crmProjectId, req.params.organizationId);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    res.json(org);
  } catch (err) {
    logger.error('[CRM] getOrganization', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/projects/:projectId/organizations/:organizationId', requireProjectAccess, async (req, res) => {
  try {
    const org = await updateOrganization(
      req.crmProjectId,
      req.params.organizationId,
      req.body,
    );
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    res.json(org);
  } catch (err) {
    logger.error('[CRM] updateOrganization', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/projects/:projectId/organizations/:organizationId', requireProjectAccess, async (req, res) => {
  try {
    const org = await softDeleteOrganization(req.crmProjectId, req.params.organizationId);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    res.json({ deleted: true, _id: org._id });
  } catch (err) {
    logger.error('[CRM] softDeleteOrganization', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== Deals ==========
router.get('/projects/:projectId/deals', requireProjectAccess, async (req, res) => {
  try {
    const { pipelineId, stage, contactId, limit, skip } = req.query;
    const deals = await listDeals({
      projectId: req.crmProjectId,
      pipelineId,
      stage,
      contactId,
      limit: limit ? parseInt(limit, 10) : 50,
      skip: skip ? parseInt(skip, 10) : 0,
    });
    res.json(deals);
  } catch (err) {
    logger.error('[CRM] listDeals', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/projects/:projectId/deals', requireProjectAccess, async (req, res) => {
  try {
    const { pipelineId, stage, contactId, organizationId, value, expectedCloseDate } = req.body;
    if (!stage) return res.status(400).json({ error: 'stage is required' });
    const deal = await createDeal({
      projectId: req.crmProjectId,
      data: {
        pipelineId,
        stage,
        contactId,
        organizationId,
        value,
        expectedCloseDate,
        ownerType: 'user',
        ownerId: req.user.id,
      },
      actorId: req.user.id,
      actorType: 'user',
    });
    res.status(201).json(deal);
  } catch (err) {
    logger.error('[CRM] createDeal', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects/:projectId/deals/:dealId', requireProjectAccess, async (req, res) => {
  try {
    const deal = await getDealById(req.crmProjectId, req.params.dealId);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    res.json(deal);
  } catch (err) {
    logger.error('[CRM] getDeal', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/projects/:projectId/deals/:dealId', requireProjectAccess, async (req, res) => {
  try {
    const existing = await getDealById(req.crmProjectId, req.params.dealId);
    if (!existing) return res.status(404).json({ error: 'Deal not found' });
    const deal = await updateDeal({
      projectId: req.crmProjectId,
      dealId: req.params.dealId,
      updates: req.body,
      previousStage: existing.stage,
      actorId: req.user.id,
      actorType: 'user',
    });
    res.json(deal);
  } catch (err) {
    logger.error('[CRM] updateDeal', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/projects/:projectId/deals/:dealId', requireProjectAccess, async (req, res) => {
  try {
    const deal = await softDeleteDeal(req.crmProjectId, req.params.dealId);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    res.json({ deleted: true, _id: deal._id });
  } catch (err) {
    logger.error('[CRM] softDeleteDeal', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== Activities ==========
router.get('/projects/:projectId/activities', requireProjectAccess, async (req, res) => {
  try {
    const { contactId, dealId, limit, skip } = req.query;
    const activities = await listActivities({
      projectId: req.crmProjectId,
      contactId,
      dealId,
      limit: limit ? parseInt(limit, 10) : 50,
      skip: skip ? parseInt(skip, 10) : 0,
    });
    res.json(activities);
  } catch (err) {
    logger.error('[CRM] listActivities', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/projects/:projectId/activities', requireProjectAccess, async (req, res) => {
  try {
    const { contactId, dealId, type, summary, metadata } = req.body;
    if (!type) return res.status(400).json({ error: 'type is required' });
    if (!contactId && !dealId) return res.status(400).json({ error: 'contactId or dealId is required' });
    const activity = await createActivity({
      projectId: req.crmProjectId,
      contactId,
      dealId,
      type: type || 'agent_action',
      actorType: 'user',
      actorId: req.user.id,
      summary,
      metadata,
    });
    if (contactId) await touchContactLastActivity(contactId);
    res.status(201).json(activity);
  } catch (err) {
    logger.error('[CRM] createActivity', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
