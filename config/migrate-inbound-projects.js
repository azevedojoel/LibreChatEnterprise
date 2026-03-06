#!/usr/bin/env node
/**
 * Migration: Create Inbound project for existing workspaces
 *
 * For each workspace without an Inbound project:
 * - Create a UserProject with name "Inbound", isInbound: true
 * - Add inbound-context section with template
 *
 * Run with: node config/migrate-inbound-projects.js
 * Dry run (default): node config/migrate-inbound-projects.js --dry-run
 * Execute: node config/migrate-inbound-projects.js --execute
 */
const path = require('path');
const { logger } = require('@librechat/data-schemas');

require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const connect = require('./connect');

const { Workspace, UserProject } = require('~/db/models');
const { createInboundProjectForWorkspace } = require('~/models/UserProject');

async function migrate({ dryRun = true } = {}) {
  await connect();

  logger.info('Starting Inbound project migration for workspaces', { dryRun });

  const workspaces = await Workspace.find().select('_id createdBy slug').lean();
  if (workspaces.length === 0) {
    logger.info('No workspaces found. Nothing to migrate.');
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const workspace of workspaces) {
    const workspaceId = workspace._id.toString();
    const existing = await UserProject.findOne({
      workspace_id: workspace._id,
      isInbound: true,
    }).lean();

    if (existing) {
      skipped++;
      logger.debug('Workspace already has Inbound project', { slug: workspace.slug });
      continue;
    }

    if (dryRun) {
      logger.info('Would create Inbound project for workspace', {
        slug: workspace.slug,
        workspaceId,
      });
      created++;
    } else {
      try {
        await createInboundProjectForWorkspace(workspaceId, workspace.createdBy);
        logger.info('Created Inbound project for workspace', {
          slug: workspace.slug,
          workspaceId,
        });
        created++;
      } catch (err) {
        logger.error('Failed to create Inbound project for workspace', {
          slug: workspace.slug,
          workspaceId,
          error: err?.message,
        });
      }
    }
  }

  logger.info('Migration complete', { dryRun, created, skipped, total: workspaces.length });
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
