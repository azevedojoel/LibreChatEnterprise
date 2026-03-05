#!/usr/bin/env node
/**
 * Migration: Add description, tags, status, ownerId to UserProject
 *
 * For each UserProject without these fields:
 * - Set description: '' if missing
 * - Set tags: [] if missing
 * - Set status: 'active' if missing
 * - Set ownerId: user (creator) if missing
 *
 * Run with: node config/migrate-userproject-add-fields.js [--execute]
 * Without --execute, runs in dry-run mode.
 */
const path = require('path');
const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');

require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const connect = require('./connect');

async function migrateUserProjectAddFields({ dryRun = true } = {}) {
  await connect();

  const { UserProject } = require('~/db/models');

  logger.info('Starting UserProject add fields migration', { dryRun });

  const projects = await UserProject.find({}).select('_id user description tags status ownerId').lean();

  logger.info(`Found ${projects.length} projects to check`);

  let updated = 0;

  for (const project of projects) {
    const update = {};
    if (project.description === undefined) {
      update.description = '';
    }
    if (project.tags === undefined) {
      update.tags = [];
    }
    if (project.status === undefined) {
      update.status = 'active';
    }
    if (project.ownerId === undefined || project.ownerId === null) {
      update.ownerId = new mongoose.Types.ObjectId(project.user);
    }

    if (Object.keys(update).length === 0) {
      continue;
    }

    if (!dryRun) {
      await UserProject.updateOne({ _id: project._id }, { $set: update });
    }

    updated++;
    if (dryRun) {
      logger.info(`[DRY RUN] Would update project ${project._id}`, update);
    } else {
      logger.info(`Updated project ${project._id}`, update);
    }
  }

  logger.info('Migration complete', { updated, total: projects.length, dryRun });
}

const args = process.argv.slice(2);
const execute = args.includes('--execute');

migrateUserProjectAddFields({ dryRun: !execute })
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Migration failed', err);
    process.exit(1);
  });
