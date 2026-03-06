#!/usr/bin/env node
/**
 * Migration: Add project tools to Ellis (system-general) agent
 *
 * Ellis needs project_create, project_list, project_archive, project_update_metadata
 * in its tools array for the ToolService to inject them. This migration adds them
 * if not already present.
 *
 * Run with: node config/migrate-ellis-add-project-tools.js [--execute]
 * Without --execute, runs in dry-run mode.
 */
const path = require('path');
const { logger } = require('@librechat/data-schemas');
const { Tools } = require('librechat-data-provider');

require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const connect = require('./connect');

const PROJECT_MANAGEMENT_TOOLS = [
  Tools.project_create,
  Tools.project_list,
  Tools.project_archive,
  Tools.project_update_metadata,
  Tools.project_switch,
];

const PROJECT_CONTEXT_TOOLS = [
  Tools.project_section_update,
  Tools.project_section_delete,
  Tools.project_section_patch,
  Tools.project_log,
  Tools.project_log_tail,
  Tools.project_log_search,
  Tools.project_log_range,
];

const TOOLS_TO_ADD = [...PROJECT_MANAGEMENT_TOOLS, ...PROJECT_CONTEXT_TOOLS];

async function migrateEllisAddProjectTools({ dryRun = true } = {}) {
  await connect();

  const { Agent } = require('~/db/models');

  logger.info('Starting Ellis add project tools migration', { dryRun });

  const ellis = await Agent.findOne({ id: 'system-general' }).lean();
  if (!ellis) {
    logger.warn('Ellis (system-general) not found in database. Nothing to migrate.');
    return;
  }

  const currentTools = ellis.tools || [];
  const toolsSet = new Set(currentTools);
  const toAdd = TOOLS_TO_ADD.filter((t) => !toolsSet.has(t));

  if (toAdd.length === 0) {
    logger.info('Ellis already has all project tools. Nothing to migrate.');
    return;
  }

  const newTools = [...currentTools, ...toAdd];

  if (dryRun) {
    logger.info('[DRY RUN] Would add project tools to Ellis', {
      toAdd,
      currentCount: currentTools.length,
      newCount: newTools.length,
    });
    return;
  }

  await Agent.updateOne({ id: 'system-general' }, { $set: { tools: newTools } });
  logger.info('Added project tools to Ellis', { toAdd, newCount: newTools.length });
}

const args = process.argv.slice(2);
const execute = args.includes('--execute');

migrateEllisAddProjectTools({ dryRun: !execute })
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Migration failed', err);
    process.exit(1);
  });
