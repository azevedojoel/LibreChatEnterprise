/**
 * Migration: ScheduledAgent (prompt string) → ScheduledPrompt (promptGroupId)
 *
 * Reads from the old `scheduledagents` collection and migrates each document to:
 * 1. Create a PromptGroup with a Prompt containing the original prompt text
 * 2. Grant the schedule owner VIEW permission on the new PromptGroup
 * 3. Create a ScheduledPrompt in `scheduledprompts` with the new promptGroupId
 *
 * Run with: node config/migrate-scheduled-agents-to-prompts.js
 * Dry run: node config/migrate-scheduled-agents-to-prompts.js --dry-run
 *
 * Run order (if upgrading):
 * 1. migrate-scheduled-agents-to-prompts.js (this script)
 * 2. migrate-workspace-tool-names.js (for agent tool names)
 */
const path = require('path');
const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { AccessRoleIds, ResourceType, PrincipalType } = require('librechat-data-provider');

require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const connect = require('./connect');
const { User, Prompt, PromptGroup, ScheduledPrompt } = require('~/db/models');
const { grantPermission } = require('~/server/services/PermissionService');

const OLD_COLLECTION = 'scheduledagents';

async function getAuthorName(userId) {
  if (!userId) return 'Migration';
  try {
    const user = await User.findById(userId).select('name username').lean();
    return user?.name || user?.username || 'Migration';
  } catch {
    return 'Migration';
  }
}

/**
 * Migrate a single ScheduledAgent document to ScheduledPrompt.
 * @param {Object} oldDoc - Document from scheduledagents
 * @param {boolean} dryRun - If true, don't write to DB
 * @returns {{ migrated: boolean, scheduleId?: string, error?: string }}
 */
async function migrateOne(oldDoc, { dryRun = true } = {}) {
  const promptText = oldDoc.prompt;
  if (!promptText || typeof promptText !== 'string' || !promptText.trim()) {
    return { migrated: false, error: 'Missing or empty prompt' };
  }

  const userId = oldDoc.userId;
  if (!userId) {
    return { migrated: false, error: 'Missing userId' };
  }

  const authorName = await getAuthorName(userId);

  try {
    if (dryRun) {
      logger.info(`[DRY RUN] Would migrate schedule "${oldDoc.name}" (${oldDoc._id})`);
      return { migrated: true };
    }

    // 1. Create PromptGroup with placeholder productionId
    const tempProductionId = new mongoose.Types.ObjectId();
    const groupName = `Migrated: ${oldDoc.name}`.slice(0, 200);
    const promptGroup = await PromptGroup.create({
      name: groupName,
      author: userId,
      authorName,
      productionId: tempProductionId,
      category: '',
      projectIds: [],
    });

    // 2. Create Prompt and link to group
    const prompt = await Prompt.create({
      groupId: promptGroup._id,
      author: userId,
      prompt: promptText.trim(),
      type: 'text',
    });

    // 3. Update PromptGroup with real productionId
    await PromptGroup.updateOne(
      { _id: promptGroup._id },
      { $set: { productionId: prompt._id } },
    );

    // 4. Grant user VIEW permission on the PromptGroup
    await grantPermission({
      principalType: PrincipalType.USER,
      principalId: userId,
      resourceType: ResourceType.PROMPTGROUP,
      resourceId: promptGroup._id,
      accessRoleId: AccessRoleIds.PROMPTGROUP_VIEWER,
      grantedBy: userId,
    });

    // 5. Create ScheduledPrompt
    const newSchedule = await ScheduledPrompt.create({
      userId,
      agentId: oldDoc.agentId,
      name: oldDoc.name,
      promptGroupId: promptGroup._id,
      scheduleType: oldDoc.scheduleType || 'recurring',
      cronExpression: oldDoc.scheduleType === 'recurring' ? (oldDoc.cronExpression || null) : null,
      runAt: oldDoc.scheduleType === 'one-off' && oldDoc.runAt ? new Date(oldDoc.runAt) : null,
      enabled: oldDoc.enabled !== false,
      timezone: oldDoc.timezone || 'UTC',
      lastRunAt: oldDoc.lastRunAt ? new Date(oldDoc.lastRunAt) : null,
      lastRunStatus: oldDoc.lastRunStatus || null,
      conversationId: oldDoc.conversationId || null,
      selectedTools: oldDoc.selectedTools ?? null,
    });

    return { migrated: true, scheduleId: newSchedule._id.toString() };
  } catch (err) {
    logger.error(`[migrate-scheduled-agents] Error migrating ${oldDoc._id}:`, err);
    return { migrated: false, error: err?.message || String(err) };
  }
}

/**
 * Migrate all ScheduledAgent documents to ScheduledPrompt.
 * @param {{ dryRun?: boolean }} opts
 */
async function migrateScheduledAgentsToPrompts({ dryRun = true } = {}) {
  await connect();

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database not connected');
  }

  const collections = await db.listCollections().toArray();
  const hasOldCollection = collections.some((c) => c.name === OLD_COLLECTION);

  if (!hasOldCollection) {
    logger.info('No scheduledagents collection found. Migration not needed.');
    return { dryRun, total: 0, migrated: 0, failed: 0 };
  }

  const oldCollection = db.collection(OLD_COLLECTION);
  const oldDocs = await oldCollection.find({}).toArray();

  if (oldDocs.length === 0) {
    logger.info('scheduledagents collection is empty. Migration not needed.');
    return { dryRun, total: 0, migrated: 0, failed: 0 };
  }

  logger.info(`Found ${oldDocs.length} documents in ${OLD_COLLECTION}`);

  let migrated = 0;
  let failed = 0;

  for (const doc of oldDocs) {
    const result = await migrateOne(doc, { dryRun });
    if (result.migrated) {
      migrated++;
    } else {
      failed++;
      logger.warn(`Skipped ${doc._id}: ${result.error}`);
    }
  }

  const summary = { dryRun, total: oldDocs.length, migrated, failed };
  logger.info('Migration completed', summary);
  return summary;
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

migrateScheduledAgentsToPrompts({ dryRun })
  .then((result) => {
    console.log('\nResult:', JSON.stringify(result, null, 2));
    if (dryRun && result.total > 0) {
      console.log('\nTo run the actual migration, remove the --dry-run flag');
    }
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Migration failed:', error);
    process.exit(1);
  });

module.exports = {
  migrateScheduledAgentsToPrompts,
  migrateOne,
};
