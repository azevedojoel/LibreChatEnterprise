#!/usr/bin/env node
/**
 * Migration: projectId -> workspace_id
 *
 * For each user with projectId:
 * - Create a Workspace from the Project (if not already created)
 * - Set user.workspace_id = workspace._id
 * - Unset user.projectId
 *
 * Run with: node config/migrate-project-to-workspace.js
 * Dry run (default): node config/migrate-project-to-workspace.js --dry-run
 * Execute: node config/migrate-project-to-workspace.js --execute
 */
const path = require('path');
const { logger } = require('@librechat/data-schemas');
const { GLOBAL_PROJECT_NAME } = require('librechat-data-provider').Constants;
const { SystemRoles } = require('librechat-data-provider');

require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const connect = require('./connect');

const { User, Workspace, Project } = require('~/db/models');

function slugify(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function migrate({ dryRun = true } = {}) {
  await connect();

  logger.info('Starting projectId -> workspace_id migration', { dryRun });

  const adminUser = await User.findOne({ role: SystemRoles.ADMIN }).select('_id').lean();
  if (!adminUser) {
    throw new Error('No admin user found. Cannot set createdBy for workspaces.');
  }
  const adminId = adminUser._id;

  const usersWithProject = await User.find({ projectId: { $exists: true, $ne: null } })
    .select('_id projectId email')
    .lean();

  if (usersWithProject.length === 0) {
    logger.info('No users with projectId found. Nothing to migrate.');
    return;
  }

  const projectIds = [...new Set(usersWithProject.map((u) => u.projectId?.toString()).filter(Boolean))];
  const projects = await Project.find({ _id: { $in: projectIds } }).select('name _id').lean();

  const projectMap = new Map(projects.map((p) => [p._id.toString(), p]));

  const slugToWorkspace = new Map();

  for (const projectId of projectIds) {
    const project = projectMap.get(projectId);
    if (!project) {
      logger.warn('Project not found for projectId', { projectId });
      continue;
    }
    if (project.name.trim().toLowerCase() === GLOBAL_PROJECT_NAME) {
      logger.info('Skipping global project (instance)');
      continue;
    }

    const slug = slugify(project.name) || `project-${projectId.slice(-6)}`;
    let workspace = slugToWorkspace.get(slug);

    if (!workspace) {
      const existing = await Workspace.findOne({ slug }).lean();
      if (existing) {
        workspace = existing;
      } else if (!dryRun) {
        workspace = await Workspace.create({
          name: project.name,
          slug,
          createdBy: adminId,
        });
        workspace = workspace.toObject ? workspace.toObject() : workspace;
      } else {
        logger.info('Would create workspace', { name: project.name, slug });
        workspace = { _id: 'dry-run', slug };
      }
      slugToWorkspace.set(slug, workspace);
    }

    const usersToUpdate = usersWithProject.filter(
      (u) => u.projectId && u.projectId.toString() === projectId,
    );

    for (const user of usersToUpdate) {
      if (dryRun) {
        logger.info('Would set workspace_id for user', {
          userId: user._id,
          email: user.email,
          workspaceSlug: workspace.slug,
        });
      } else {
        await User.updateOne(
          { _id: user._id },
          { $set: { workspace_id: workspace._id }, $unset: { projectId: '' } },
        );
        logger.info('Set workspace_id and cleared projectId for user', {
          userId: user._id,
          email: user.email,
        });
      }
    }
  }

  logger.info('Migration complete', { dryRun, usersProcessed: usersWithProject.length });
}

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const dryRun = !execute;

migrate({ dryRun })
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Migration failed', err);
    process.exit(1);
  });
