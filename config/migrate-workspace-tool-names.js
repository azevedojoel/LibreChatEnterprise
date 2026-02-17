/**
 * Migration: Replace old workspace tool names with workspace_* prefix,
 * and search_files/workspace_search_files -> search_user_files
 *
 * read_file -> workspace_read_file
 * edit_file -> workspace_edit_file
 * create_file -> workspace_create_file
 * delete_file -> workspace_delete_file
 * list_files -> workspace_list_files
 * search_files -> search_user_files
 * workspace_search_files -> search_user_files
 * glob_files -> workspace_glob_files
 *
 * Run with: node config/migrate-workspace-tool-names.js
 * Dry run: node config/migrate-workspace-tool-names.js --dry-run
 */
const path = require('path');
const { logger } = require('@librechat/data-schemas');

require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const connect = require('./connect');
const { Agent, Preset, Conversation } = require('~/db/models');

const TOOL_MAP = {
  read_file: 'workspace_read_file',
  edit_file: 'workspace_edit_file',
  create_file: 'workspace_create_file',
  delete_file: 'workspace_delete_file',
  list_files: 'workspace_list_files',
  search_files: 'search_user_files',
  workspace_search_files: 'search_user_files',
  glob_files: 'workspace_glob_files',
};

const OLD_NAMES = Object.keys(TOOL_MAP);

function migrateToolsArray(tools) {
  if (!Array.isArray(tools)) return tools;
  return tools.map((t) => TOOL_MAP[t] ?? t);
}

function migrateToolOptions(toolOptions) {
  if (!toolOptions || typeof toolOptions !== 'object') return toolOptions;
  const result = {};
  for (const [key, value] of Object.entries(toolOptions)) {
    const newKey = TOOL_MAP[key] ?? key;
    result[newKey] = value;
  }
  return result;
}

function toolsArrayHasOldNames(tools) {
  if (!Array.isArray(tools)) return false;
  return tools.some((t) => OLD_NAMES.includes(t));
}

function toolOptionsHasOldKeys(toolOptions) {
  if (!toolOptions || typeof toolOptions !== 'object') return false;
  return OLD_NAMES.some((old) => old in toolOptions);
}

/** Build $or query for agents with old tool names in tools, versions.tools, or tool_options */
function buildAgentQuery() {
  const conditions = [
    { tools: { $in: OLD_NAMES } },
    { 'versions.tools': { $in: OLD_NAMES } },
  ];
  for (const old of OLD_NAMES) {
    conditions.push({ [`tool_options.${old}`]: { $exists: true } });
  }
  return { $or: conditions };
}

async function migrateAgents({ dryRun = true } = {}) {
  const query = buildAgentQuery();
  const agents = await Agent.find(query).lean();

  if (agents.length === 0) {
    logger.info('No agents with old workspace tool names. Migration not needed.');
    return { total: 0, migrated: 0 };
  }

  logger.info(`Found ${agents.length} agents with old workspace tool names`);

  let migrated = 0;
  for (const agent of agents) {
    const updates = {};

    const tools = agent.tools ?? [];
    if (toolsArrayHasOldNames(tools)) {
      updates.tools = migrateToolsArray(tools);
    }

    const toolOptions = agent.tool_options;
    if (toolOptionsHasOldKeys(toolOptions)) {
      updates.tool_options = migrateToolOptions(toolOptions);
    }

    const versions = agent.versions ?? [];
    const newVersions = versions.map((v) => {
      let changed = false;
      const newV = { ...v };

      const vTools = v?.tools ?? [];
      if (toolsArrayHasOldNames(vTools)) {
        newV.tools = migrateToolsArray(vTools);
        changed = true;
      }

      const vToolOptions = v?.tool_options;
      if (toolOptionsHasOldKeys(vToolOptions)) {
        newV.tool_options = migrateToolOptions(vToolOptions);
        changed = true;
      }

      return changed ? newV : v;
    });

    const versionsChanged = JSON.stringify(versions) !== JSON.stringify(newVersions);
    if (versionsChanged) {
      updates.versions = newVersions;
    }

    if (Object.keys(updates).length === 0) {
      continue;
    }

    if (!dryRun) {
      await Agent.updateOne({ _id: agent._id }, { $set: updates });
    }
    migrated++;
    logger.info(
      `${dryRun ? '[DRY RUN] Would update' : 'Updated'} agent "${agent.name}" (${agent.id})`,
    );
  }

  return { total: agents.length, migrated };
}

async function migratePresets({ dryRun = true } = {}) {
  const presets = await Preset.find({ tools: { $in: OLD_NAMES } }).lean();

  if (presets.length === 0) {
    return { total: 0, migrated: 0 };
  }

  logger.info(`Found ${presets.length} presets with old workspace tool names`);

  let migrated = 0;
  for (const preset of presets) {
    const tools = preset.tools ?? [];
    if (!toolsArrayHasOldNames(tools)) continue;

    const newTools = migrateToolsArray(tools);

    if (!dryRun) {
      await Preset.updateOne({ _id: preset._id }, { $set: { tools: newTools } });
    }
    migrated++;
    logger.info(
      `${dryRun ? '[DRY RUN] Would update' : 'Updated'} preset "${preset.title}" (${preset.presetId})`,
    );
  }

  return { total: presets.length, migrated };
}

async function migrateConversations({ dryRun = true } = {}) {
  const conversations = await Conversation.find({ tools: { $in: OLD_NAMES } }).lean();

  if (conversations.length === 0) {
    return { total: 0, migrated: 0 };
  }

  logger.info(`Found ${conversations.length} conversations with old workspace tool names`);

  let migrated = 0;
  for (const convo of conversations) {
    const tools = convo.tools ?? [];
    if (!toolsArrayHasOldNames(tools)) continue;

    const newTools = migrateToolsArray(tools);

    if (!dryRun) {
      await Conversation.updateOne(
        { _id: convo._id },
        { $set: { tools: newTools } },
      );
    }
    migrated++;
    logger.info(
      `${dryRun ? '[DRY RUN] Would update' : 'Updated'} conversation "${convo.conversationId}"`,
    );
  }

  return { total: conversations.length, migrated };
}

async function migrateWorkspaceToolNames({ dryRun = true } = {}) {
  await connect();

  logger.info('Starting workspace tool names migration', { dryRun });

  const [agents, presets, conversations] = await Promise.all([
    migrateAgents({ dryRun }),
    migratePresets({ dryRun }),
    migrateConversations({ dryRun }),
  ]);

  const result = {
    dryRun,
    agents,
    presets,
    conversations,
    totalMigrated:
      agents.migrated + presets.migrated + conversations.migrated,
  };

  logger.info('Migration completed', result);
  return result;
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

migrateWorkspaceToolNames({ dryRun })
  .then((result) => {
    console.log('\nResult:', JSON.stringify(result, null, 2));
    if (dryRun && result.totalMigrated > 0) {
      console.log('\nTo run the actual migration, remove the --dry-run flag');
    }
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Migration failed:', error);
    process.exit(1);
  });

module.exports = {
  migrateWorkspaceToolNames,
  migrateToolsArray,
  migrateToolOptions,
  TOOL_MAP,
  OLD_NAMES,
};
