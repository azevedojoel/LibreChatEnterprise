/**
 * Migration: Replace send_email with send_user_email in agent tools
 *
 * Run with: node config/migrate-send-email-to-send-user-email.js
 * Dry run: node config/migrate-send-email-to-send-user-email.js --dry-run
 */
const path = require('path');
const { logger } = require('@librechat/data-schemas');

require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const connect = require('./connect');
const { Agent } = require('~/db/models');

const OLD_TOOL = 'send_email';
const NEW_TOOL = 'send_user_email';

async function migrateSendEmailToSendUserEmail({ dryRun = true } = {}) {
  await connect();

  logger.info('Starting send_email -> send_user_email migration', { dryRun });

  const agents = await Agent.find({ 'versions.tools': OLD_TOOL }).lean();
  const toMigrate = agents.filter((agent) => {
    const versions = agent.versions || [];
    return versions.some((v) => v?.tools?.includes?.(OLD_TOOL));
  });

  if (toMigrate.length === 0) {
    logger.info('No agents have send_email in their tools. Migration not needed.');
    return { total: 0, migrated: 0 };
  }

  logger.info(`Found ${toMigrate.length} agents with send_email in tools`);

  let migrated = 0;
  for (const agent of toMigrate) {
    const versions = agent.versions || [];
    let changed = false;
    const newVersions = versions.map((v) => {
      const tools = v?.tools || [];
      if (!tools.includes(OLD_TOOL)) {
        return v;
      }
      changed = true;
      return {
        ...v,
        tools: tools.map((t) => (t === OLD_TOOL ? NEW_TOOL : t)),
      };
    });

    if (!changed) {
      continue;
    }

    if (!dryRun) {
      await Agent.updateOne(
        { _id: agent._id },
        { $set: { versions: newVersions } },
      );
    }
    migrated++;
    logger.info(
      `${dryRun ? '[DRY RUN] Would update' : 'Updated'} agent "${agent.name}" (${agent.id})`,
    );
  }

  logger.info('Migration completed', {
    dryRun,
    total: toMigrate.length,
    migrated,
  });
  return { total: toMigrate.length, migrated };
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

migrateSendEmailToSendUserEmail({ dryRun })
  .then((result) => {
    console.log('\nResult:', result);
    if (dryRun && result.total > 0) {
      console.log('\nTo run the actual migration, remove the --dry-run flag');
    }
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Migration failed:', error);
    process.exit(1);
  });

module.exports = { migrateSendEmailToSendUserEmail };
