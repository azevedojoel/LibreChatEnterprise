const express = require('express');
const { logger } = require('@librechat/data-schemas');
const {
  listUserProjects,
  createUserProject,
  getUserProject,
  updateUserProject,
  deleteUserProject,
} = require('~/models/UserProject');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const router = express.Router();
router.use(requireJwtAuth);

/**
 * GET /api/user-projects
 * List user's projects (paginated)
 */
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 25;
    const cursor = req.query.cursor;
    const result = await listUserProjects(req.user.id, { limit, cursor });
    res.status(200).json(result);
  } catch (error) {
    logger.error('[userProjects] Error listing projects', error);
    res.status(500).json({ error: 'Error fetching projects' });
  }
});

/**
 * POST /api/user-projects
 * Create a new project
 * Body: { name: string }
 */
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const project = await createUserProject(req.user.id, { name });
    res.status(201).json(project);
  } catch (error) {
    logger.error('[userProjects] Error creating project', error);
    if (error.code === 11000) {
      return res.status(409).json({ error: 'A project with this name already exists' });
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
 * Update project name or context
 * Body: { name?: string, context?: string }
 */
router.patch('/:id', async (req, res) => {
  try {
    const { name, context } = req.body;
    const project = await updateUserProject(req.user.id, req.params.id, { name, context });
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
 * DELETE /api/user-projects/:id
 * Delete a project
 */
router.delete('/:id', async (req, res) => {
  try {
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
