const express = require('express');
const { logger } = require('@librechat/data-schemas');
const {
  listUserProjects,
  createUserProject,
  getUserProject,
  updateUserProject,
  deleteUserProject,
  archiveUserProject,
} = require('~/models/UserProject');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const router = express.Router();
router.use(requireJwtAuth);

/**
 * GET /api/user-projects
 * List user's projects (paginated)
 * Query: limit, cursor, status (active|archived|all)
 */
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 25;
    const cursor = req.query.cursor;
    const status = req.query.status || 'active';
    const result = await listUserProjects(req.user.id, { limit, cursor, status });
    res.status(200).json(result);
  } catch (error) {
    logger.error('[userProjects] Error listing projects', error);
    res.status(500).json({ error: 'Error fetching projects' });
  }
});

/**
 * POST /api/user-projects
 * Create a new project
 * Body: { name: string, description?: string, tags?: string[], sharedWithWorkspace?: boolean, templateProjectId?: string }
 */
router.post('/', async (req, res) => {
  try {
    const { name, description, tags, sharedWithWorkspace, templateProjectId } = req.body;
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const result = await createUserProject(req.user.id, {
      name,
      description,
      tags,
      sharedWithWorkspace: !!sharedWithWorkspace,
      templateProjectId,
    });
    if (result.error) {
      return res.status(403).json({
        error: result.error,
        ...(result.adminMemberId && { adminMemberId: result.adminMemberId }),
      });
    }
    res.status(201).json(result.project);
  } catch (error) {
    logger.error('[userProjects] Error creating project', error);
    if (error.code === 11000) {
      return res.status(409).json({ error: 'A project with this name already exists' });
    }
    if (error.message?.includes('workspace admin') || error.message?.includes('no workspace')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Error creating project' });
  }
});

/**
 * GET /api/user-projects/:id
 * Get a single project (with context)
 */
router.get('/:id', async (req, res) => {
  try {
    const project = await getUserProject(req.user.id, req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.status(200).json(project);
  } catch (error) {
    logger.error('[userProjects] Error getting project', error);
    res.status(500).json({ error: 'Error fetching project' });
  }
});

/**
 * PATCH /api/user-projects/:id
 * Update project name, context, or metadata
 * Body: { name?: string, context?: string, description?: string, tags?: string[], ownerId?: string }
 */
router.patch('/:id', async (req, res) => {
  try {
    const { name, context, description, tags, ownerId } = req.body;
    const project = await updateUserProject(req.user.id, req.params.id, {
      name,
      context,
      description,
      tags,
      ownerId,
    });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.status(200).json(project);
  } catch (error) {
    logger.error('[userProjects] Error updating project', error);
    res.status(500).json({ error: 'Error updating project' });
  }
});

/**
 * POST /api/user-projects/:id/archive
 * Archive a project (soft delete). Only owner or workspace admin can archive.
 */
router.post('/:id/archive', async (req, res) => {
  try {
    const project = await getUserProject(req.user.id, req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }
    if (project.isInbound) {
      return res.status(403).json({ error: 'Inbound project cannot be archived' });
    }
    const archived = await archiveUserProject(req.user.id, req.params.id);
    if (!archived) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }
    res.status(200).json({ archived: true });
  } catch (error) {
    logger.error('[userProjects] Error archiving project', error);
    res.status(500).json({ error: 'Error archiving project' });
  }
});

/**
 * DELETE /api/user-projects/:id
 * Delete a project
 */
router.delete('/:id', async (req, res) => {
  try {
    const project = await getUserProject(req.user.id, req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (project.isInbound) {
      return res.status(403).json({ error: 'Inbound project cannot be deleted' });
    }
    const deleted = await deleteUserProject(req.user.id, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.status(200).json({ deleted: true });
  } catch (error) {
    logger.error('[userProjects] Error deleting project', error);
    res.status(500).json({ error: 'Error deleting project' });
  }
});

module.exports = router;
