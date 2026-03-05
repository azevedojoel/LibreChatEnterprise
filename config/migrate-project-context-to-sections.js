/**
 * One-time migration: Move UserProject.context into ProjectContextSection collection.
 * For each UserProject with non-empty context, creates a section { sectionId: 'overview', title: 'Overview', content }.
 * Run: node config/migrate-project-context-to-sections.js [--execute]
 * Without --execute, runs in dry-run mode.
 */
const path = require('path');
const { logger } = require('@librechat/data-schemas');

require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const connect = require('./connect');

async function migrateProjectContextToSections({ dryRun = true } = {}) {
  await connect();

  const { UserProject, ProjectContextSection } = require('~/db/models');

  logger.info('Starting Project Context to Sections migration', { dryRun });

  const projectsWithContext = await UserProject.find({
    context: { $exists: true, $ne: '', $not: { $regex: /^\s*$/ } },
  })
    .select('_id user context')
    .lean();

  logger.info(`Found ${projectsWithContext.length} projects with non-empty context`);

  let migrated = 0;
  let skipped = 0;

  for (const project of projectsWithContext) {
    const projectId = project._id.toString();
    const existingSection = await ProjectContextSection.findOne({
      projectId: project._id,
      sectionId: 'overview',
    }).lean();

    if (existingSection) {
      logger.debug(`Project ${projectId} already has overview section, skipping`);
      skipped++;
      continue;
    }

    const content = (project.context || '').trim().slice(0, 50 * 1024); // 50KB max per section
    if (!content) {
      skipped++;
      continue;
    }

    if (!dryRun) {
      await ProjectContextSection.create({
        projectId: project._id,
        sectionId: 'overview',
        title: 'Overview',
        content,
      });
      await UserProject.updateOne(
        { _id: project._id },
        { $set: { context: '' } },
      );
    }

    migrated++;
    if (dryRun) {
      logger.info(`[DRY RUN] Would migrate project ${projectId} (${content.length} chars)`);
    } else {
      logger.info(`Migrated project ${projectId}`);
    }
  }

  logger.info('Migration complete', { migrated, skipped, dryRun });
}

const args = process.argv.slice(2);
const execute = args.includes('--execute');

migrateProjectContextToSections({ dryRun: !execute })
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Migration failed', err);
    process.exit(1);
  });
