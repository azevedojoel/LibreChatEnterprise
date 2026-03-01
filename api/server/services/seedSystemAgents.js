/**
 * Seed system agents from librechat.yaml config.
 * Creates agents defined in endpoints.agents.systemAgents if they don't exist.
 * Uses a system user as author (created if missing).
 * Grants PUBLIC VIEW so all users see them in the agent selection UI.
 */
const { logger } = require('@librechat/data-schemas');
const {
  EModelEndpoint,
  ResourceType,
  PrincipalType,
  AccessRoleIds,
} = require('librechat-data-provider');
const { createAgent } = require('~/models/Agent');
const { findUser } = require('~/models');
const { SystemRoles } = require('librechat-data-provider');
const { grantPermission } = require('~/server/services/PermissionService');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const SYSTEM_USER_EMAIL = '__system__@internal.local';

async function ensureSystemUser() {
  const User = require('~/db/models').User;
  let systemUser = await findUser({ email: SYSTEM_USER_EMAIL }, '_id');
  if (systemUser) {
    return systemUser._id;
  }
  const hashedPassword = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
  const [user] = await User.create([
    {
      email: SYSTEM_USER_EMAIL,
      name: 'System',
      username: '__system__',
      provider: 'local',
      role: SystemRoles.ADMIN,
      emailVerified: true,
      password: hashedPassword,
    },
  ]);
  logger.info('[seedSystemAgents] Created system user for agent authorship');
  return user._id;
}

async function seedSystemAgents(appConfig) {
  const agentsConfig = appConfig?.endpoints?.[EModelEndpoint.agents];
  const systemAgents = agentsConfig?.systemAgents;
  if (!systemAgents || !Array.isArray(systemAgents) || systemAgents.length === 0) {
    return;
  }

  const Agent = require('~/db/models').Agent;
  const systemAuthorId = await ensureSystemUser();

  for (const def of systemAgents) {
    let agent = await Agent.findOne({ id: def.id }).lean();

    if (!agent) {
      const agentDef = {
        name: def.name || 'General Chat',
        provider: def.provider || 'openAI',
        model: def.model || 'gpt-4o',
        instructions: def.instructions || 'You are a helpful assistant.',
        tools: def.tools || ['file_search', 'web_search'],
      };
      try {
        const created = await createAgent({
          id: def.id,
          ...agentDef,
          provider: def.provider || 'openAI',
          author: systemAuthorId,
          category: 'general',
        });
        agent = created.toObject ? created.toObject() : created;
        logger.info(`[seedSystemAgents] Created system agent: ${def.id}`);
      } catch (err) {
        logger.error(`[seedSystemAgents] Failed to create agent ${def.id}:`, err);
        continue;
      }
    }
    /** Do NOT update existing system agents on restart - that would overwrite user customizations
     * (e.g. expanded MCP tools, tool_options). Only create when missing. */
    if (agent?._id) {
      try {
        await Promise.all([
          grantPermission({
            principalType: PrincipalType.PUBLIC,
            principalId: null,
            resourceType: ResourceType.AGENT,
            resourceId: agent._id,
            accessRoleId: AccessRoleIds.AGENT_EDITOR,
            grantedBy: systemAuthorId,
          }),
          grantPermission({
            principalType: PrincipalType.PUBLIC,
            principalId: null,
            resourceType: ResourceType.REMOTE_AGENT,
            resourceId: agent._id,
            accessRoleId: AccessRoleIds.REMOTE_AGENT_EDITOR,
            grantedBy: systemAuthorId,
          }),
        ]);
      } catch (permErr) {
        logger.warn(
          `[seedSystemAgents] Permission grant for ${def.id} (may already exist):`,
          permErr?.message,
        );
      }
    }
  }
}

module.exports = { seedSystemAgents };
