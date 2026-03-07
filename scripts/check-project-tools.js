#!/usr/bin/env node
/**
 * Diagnose why a conversation has project context but no project tools.
 * Checks: conversation userProjectId, agent, agent's tools (including project_*).
 *
 * Usage: node scripts/check-project-tools.js <conversationId>
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
require('module-alias/register');
require('module-alias').addAlias('~', path.resolve(__dirname, '..', 'api'));

const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');
const { Tools } = require('librechat-data-provider');

const PROJECT_TOOL_NAMES = [
  Tools.project_create,
  Tools.project_list,
  Tools.project_archive,
  Tools.project_update_metadata,
  Tools.project_switch,
  Tools.project_section_update,
  Tools.project_section_delete,
  Tools.project_section_patch,
  Tools.project_log,
  Tools.project_log_tail,
  Tools.project_log_search,
  Tools.project_log_range,
].filter(Boolean);

async function main() {
  const conversationId = process.argv[2];
  if (!conversationId) {
    console.error('Usage: node scripts/check-project-tools.js <conversationId>');
    process.exit(1);
  }

  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('MONGO_URI not set. Check .env');
    process.exit(1);
  }

  createModels(mongoose);
  await mongoose.connect(MONGO_URI);

  const Conversation = mongoose.models.Conversation;
  const Agent = mongoose.models.Agent;

  const convo = await Conversation.findOne({ conversationId }).lean();
  if (!convo) {
    console.log(`\nConversation ${conversationId} NOT FOUND in DB.\n`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const agentId = convo.agent_id;
  let agent = null;
  if (agentId) {
    agent = await Agent.findOne({ id: agentId }).lean();
  }

  const userProjectId = convo.userProjectId?.toString?.() ?? convo.userProjectId ?? null;

  console.log('\n' + '='.repeat(70));
  console.log('PROJECT TOOLS DIAGNOSTIC');
  console.log('='.repeat(70));
  console.log(`Conversation ID: ${conversationId}`);
  console.log(`userProjectId:   ${userProjectId ?? '(none)'}`);
  console.log(`Agent ID:       ${agentId ?? '(none)'}`);
  console.log('');

  if (!agent) {
    console.log('Agent: NOT FOUND');
    if (agentId) {
      console.log(`  → Agent "${agentId}" does not exist in DB. Check agent_id.`);
    }
    console.log('');
    await mongoose.disconnect();
    process.exit(0);
  }

  const agentTools = agent.tools ?? [];
  const hasProjectTools = agentTools.some(
    (t) => typeof t === 'string' && t.startsWith('project_'),
  );
  const projectToolsInAgent = agentTools.filter(
    (t) => typeof t === 'string' && t.startsWith('project_'),
  );

  console.log('Agent:', agent.name || agent.id);
  console.log(`  tools count: ${agentTools.length}`);
  console.log(`  has project_* tools: ${hasProjectTools ? 'YES' : 'NO'}`);
  if (projectToolsInAgent.length > 0) {
    console.log(`  project tools: ${projectToolsInAgent.join(', ')}`);
  } else {
    console.log('  project tools: (none)');
  }
  console.log('');

  if (userProjectId && !hasProjectTools) {
    console.log('>>> DIAGNOSIS <<<');
    console.log('');
    console.log('The conversation has a project (userProjectId) but the agent does NOT have');
    console.log('any project_* tools in its tools array.');
    console.log('');
    console.log('Project context is injected into the system message whenever userProjectId');
    console.log('exists - but the actual tool definitions are only sent when the agent has');
    console.log('at least one project_* tool. So you get context + instructions but no tools.');
    console.log('');
    console.log('FIX: Add project tools to the agent. For Ellis (system-general):');
    console.log('  npm run migrate:ellis-add-project-tools:dry-run');
    console.log('  npm run migrate:ellis-add-project-tools');
    console.log('');
    console.log('For other agents: Add at least one project tool (e.g. project_list) to');
    console.log('the agent\'s tools array in the Agent panel. ToolService will auto-inject');
    console.log('the rest.');
  } else if (!userProjectId) {
    console.log('>>> NOTE <<<');
    console.log('Conversation has no userProjectId. Project context is only injected when');
    console.log('a project is assigned (via UI picker or project_switch tool).');
  } else {
    console.log('>>> STATUS <<<');
    console.log('Agent has project tools. If tools still don\'t appear, check:');
    console.log('- ephemeralAgent override (chat badge) filtering tools');
    console.log('- ToolService logs for filtered tools');
  }

  console.log('');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
