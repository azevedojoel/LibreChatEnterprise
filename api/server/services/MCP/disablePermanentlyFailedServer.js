/**
 * Auto-disable a permanently failed MCP integration for a user.
 * Removes from plugins, agents, OAuth tokens, disconnects, and invalidates cache.
 */
const { logger } = require('@librechat/data-schemas');
const { Constants } = require('librechat-data-provider');
const { updateUserPlugins } = require('~/models');
const { Agent } = require('~/db/models');
const { updateAgent } = require('~/models/Agent');
const { deleteUserPluginAuth } = require('~/server/services/PluginService');
const { uninstallOAuthMCP } = require('./oauthUninstall');
const { getMCPManager } = require('~/config');
const { invalidateCachedTools } = require('~/server/services/Config/getCachedTools');
const { getAppConfig } = require('~/server/services/Config');

/**
 * Disable a permanently failed MCP server for a user.
 * Performs: uninstall plugin, delete auth, OAuth cleanup, remove from agents, disconnect, invalidate cache.
 * @param {string} userId - User ID
 * @param {string} serverName - MCP server name (e.g. HubSpot)
 * @param {Object} [user] - Optional user document (if already loaded). If not provided, will be fetched.
 */
async function disablePermanentlyFailedServer(userId, serverName, user = null) {
  const pluginKey = `${Constants.mcp_prefix}${serverName}`;
  const mcpDelimiter = Constants.mcp_delimiter;
  const serverToolSuffix = `${mcpDelimiter}${serverName}`;

  try {
    let userDoc = user;
    if (!userDoc) {
      const { User } = require('~/db/models');
      userDoc = await User.findById(userId).lean();
      if (!userDoc) {
        logger.warn(`[disablePermanentlyFailedServer] User ${userId} not found`);
        return;
      }
    }

    // 1. Uninstall from user plugins
    try {
      await updateUserPlugins(userId, userDoc.plugins, pluginKey, 'uninstall');
    } catch (err) {
      logger.error(`[disablePermanentlyFailedServer] Error uninstalling plugin ${pluginKey}:`, err);
    }

    // 2. Delete OAuth/token auth for this server
    try {
      await deleteUserPluginAuth(userId, null, true, pluginKey);
    } catch (err) {
      logger.error(`[disablePermanentlyFailedServer] Error deleting plugin auth for ${pluginKey}:`, err);
    }

    // 3. OAuth-specific cleanup (revoke tokens, clear flow state)
    try {
      const appConfig = await getAppConfig();
      await uninstallOAuthMCP(userId, pluginKey, appConfig);
    } catch (err) {
      logger.error(`[disablePermanentlyFailedServer] Error in OAuth uninstall for ${pluginKey}:`, err);
    }

    // 4. Remove server from user's agents
    try {
      const agents = await Agent.find({
        author: userId,
        mcpServerNames: serverName,
      }).lean();

      for (const agent of agents) {
        const currentTools =
          agent.versions?.[agent.versions?.length - 1]?.tools ?? agent.tools ?? [];
        const filteredTools = currentTools.filter(
          (t) => !t.endsWith(serverToolSuffix),
        );
        if (filteredTools.length < currentTools.length) {
          await updateAgent({ id: agent.id, author: userId }, { tools: filteredTools }, {
            updatingUserId: userId,
            skipVersioning: false,
          });
        }
      }
    } catch (err) {
      logger.error(
        `[disablePermanentlyFailedServer] Error removing server from agents for user ${userId}:`,
        err,
      );
    }

    // 5. Disconnect MCP connection
    try {
      const mcpManager = getMCPManager(userId);
      if (mcpManager) {
        await mcpManager.disconnectUserConnection(userId, serverName);
      }
    } catch (err) {
      logger.error(
        `[disablePermanentlyFailedServer] Error disconnecting MCP for user ${userId}:`,
        err,
      );
    }

    // 6. Invalidate cached tools
    try {
      await invalidateCachedTools({ userId, serverName });
    } catch (err) {
      logger.error(
        `[disablePermanentlyFailedServer] Error invalidating cache for user ${userId}:`,
        err,
      );
    }

    logger.info(
      `[disablePermanentlyFailedServer] Successfully disabled MCP server "${serverName}" for user ${userId}`,
    );
  } catch (err) {
    logger.error(
      `[disablePermanentlyFailedServer] Unexpected error disabling ${serverName} for user ${userId}:`,
      err,
    );
  }
}

module.exports = { disablePermanentlyFailedServer };
