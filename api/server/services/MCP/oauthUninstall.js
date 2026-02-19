/**
 * OAuth MCP uninstall logic - revoke tokens, delete from DB, clear flow state.
 * Shared between UserController (manual uninstall) and disablePermanentlyFailedServer (auto-disable).
 */
const { logger } = require('@librechat/data-schemas');
const { Constants, CacheKeys } = require('librechat-data-provider');
const { MCPOAuthHandler, MCPTokenStorage } = require('@librechat/api');
const { findToken } = require('~/models');
const { getMCPServersRegistry, getFlowStateManager } = require('~/config');
const { getLogStores } = require('~/cache');
const { logOAuthAudit, OAuthAuditEvents } = require('~/server/utils/auditLog');
const { Token } = require('~/db/models');

/**
 * OAuth MCP specific uninstall logic - revoke tokens at provider, delete from DB, clear flow state.
 * @param {string} userId - User ID
 * @param {string} pluginKey - Plugin key (e.g. mcp_HubSpot)
 * @param {Object} [appConfig] - App config for server config fallback
 */
async function uninstallOAuthMCP(userId, pluginKey, appConfig = {}) {
  if (!pluginKey.startsWith(Constants.mcp_prefix)) {
    return;
  }

  const serverName = pluginKey.replace(Constants.mcp_prefix, '');
  const serverConfig =
    (await getMCPServersRegistry().getServerConfig(serverName, userId)) ??
    appConfig?.mcpServers?.[serverName];
  const oauthServers = await getMCPServersRegistry().getOAuthServers(userId);
  if (!oauthServers.has(serverName)) {
    return;
  }

  const clientTokenData = await MCPTokenStorage.getClientInfoAndMetadata({
    userId,
    serverName,
    findToken,
  });
  if (clientTokenData == null) {
    return;
  }
  const { clientInfo, clientMetadata } = clientTokenData;

  const tokens = await MCPTokenStorage.getTokens({
    userId,
    serverName,
    findToken,
  });

  const revocationEndpoint =
    serverConfig?.oauth?.revocation_endpoint ?? clientMetadata.revocation_endpoint;
  const revocationEndpointAuthMethodsSupported =
    serverConfig?.oauth?.revocation_endpoint_auth_methods_supported ??
    clientMetadata.revocation_endpoint_auth_methods_supported;
  const oauthHeaders = serverConfig?.oauth_headers ?? {};

  if (tokens?.access_token) {
    try {
      await MCPOAuthHandler.revokeOAuthToken(
        serverName,
        tokens.access_token,
        'access',
        {
          serverUrl: serverConfig.url,
          clientId: clientInfo.client_id,
          clientSecret: clientInfo.client_secret ?? '',
          revocationEndpoint,
          revocationEndpointAuthMethodsSupported,
        },
        oauthHeaders,
      );
    } catch (error) {
      logger.error(`Error revoking OAuth access token for ${serverName}:`, error);
    }
  }

  if (tokens?.refresh_token) {
    try {
      await MCPOAuthHandler.revokeOAuthToken(
        serverName,
        tokens.refresh_token,
        'refresh',
        {
          serverUrl: serverConfig.url,
          clientId: clientInfo.client_id,
          clientSecret: clientInfo.client_secret ?? '',
          revocationEndpoint,
          revocationEndpointAuthMethodsSupported,
        },
        oauthHeaders,
      );
    } catch (error) {
      logger.error(`Error revoking OAuth refresh token for ${serverName}:`, error);
    }
  }

  await MCPTokenStorage.deleteUserTokens({
    userId,
    serverName,
    deleteToken: async (filter) => {
      await Token.deleteOne(filter);
    },
  });

  const flowsCache = getLogStores(CacheKeys.FLOWS);
  const flowManager = getFlowStateManager(flowsCache);
  const flowId = MCPOAuthHandler.generateFlowId(userId, serverName);
  await flowManager.deleteFlow(flowId, 'mcp_get_tokens');
  await flowManager.deleteFlow(flowId, 'mcp_oauth');

  logOAuthAudit({
    event: OAuthAuditEvents.MCP_OAUTH_REVOKE,
    userId,
    serverName,
    result: 'success',
  });
}

module.exports = { uninstallOAuthMCP };
