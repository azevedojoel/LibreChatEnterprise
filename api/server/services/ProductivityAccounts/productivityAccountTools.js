/**
 * Tools for managing Google and Microsoft productivity accounts (multi-account support).
 * Used by Casey and other agents that need to list, get, switch, or add accounts.
 */
const crypto = require('crypto');
const { tool } = require('@langchain/core/tools');
const { Tools } = require('librechat-data-provider');
const { CacheKeys } = require('librechat-data-provider');
const { MCPTokenStorage, MCPActiveAccountStorage, getBasePath } = require('@librechat/api');
const { findToken, findTokens, createToken, updateToken } = require('~/models');
const { Token } = require('~/db/models');
const { reinitMCPServer } = require('~/server/services/Tools/mcp');
const { getUserMCPAuthMap } = require('@librechat/api');
const { findPluginAuthsByKeys } = require('~/models');
const getLogStores = require('~/cache/getLogStores');

const PROVIDER_MAP = {
  google: 'Google',
  microsoft: 'Microsoft',
};

/**
 * Generate a short connect URL for OAuth. Stores oauthUrl in cache and returns a safe connectUrl
 * that redirects to the OAuth provider. The model receives connectUrl (not oauthUrl) so it cannot
 * echo the raw OAuth URL.
 * @param {string} oauthUrl - The full OAuth authorization URL
 * @returns {{ shortCode: string, connectUrl: string }}
 */
async function createOAuthConnectUrl(oauthUrl) {
  const shortCode = crypto.randomBytes(6).toString('base64url');
  const oauthConnectCache = getLogStores(CacheKeys.OAUTH_CONNECT);
  await oauthConnectCache.set(shortCode, { oauthUrl });
  const baseUrl = (process.env.DOMAIN_SERVER || process.env.DOMAIN_CLIENT || 'http://localhost:3080').replace(
    /\/$/,
    '',
  );
  const basePath = getBasePath();
  const connectUrl = `${baseUrl}${basePath ? `${basePath}/` : '/'}connect/${shortCode}`;
  return { shortCode, connectUrl };
}

function resolveUserId(userOrId) {
  if (typeof userOrId === 'string') return userOrId;
  return userOrId?.id ?? userOrId?._id?.toString?.() ?? userOrId?.toString?.();
}

/**
 * @param {object} params
 * @param {string|object} params.userId - User ID or user object for scoping
 * @param {object} [params.user] - Full user object (for add_productivity_account; falls back to userId)
 * @returns {Record<string, import('@langchain/core/tools').StructuredTool>}
 */
function createProductivityAccountTools({ userId, user: userParam }) {
  const user = userParam ?? (typeof userId === 'object' ? userId : { id: userId });
  const resolvedUserId = resolveUserId(userId ?? user);

  const tokenMethods = {
    findToken,
    findTokens,
    createToken,
    updateToken,
  };

  const listProductivityAccountsTool = tool(
    async (rawInput) => {
      try {
        const provider = (rawInput?.provider || 'all').toLowerCase();
        const result = { google: [], microsoft: [] };

        if (provider === 'all' || provider === 'google') {
          const googleAccounts = await MCPTokenStorage.listAccountsForServer({
            userId: resolvedUserId,
            serverName: 'Google',
            findTokens: tokenMethods.findTokens,
          });
          result.google = googleAccounts.map((a) => ({
            accountId: a.accountId,
            provider: 'google',
          }));
        }
        if (provider === 'all' || provider === 'microsoft') {
          const msAccounts = await MCPTokenStorage.listAccountsForServer({
            userId: resolvedUserId,
            serverName: 'Microsoft',
            findTokens: tokenMethods.findTokens,
          });
          result.microsoft = msAccounts.map((a) => ({
            accountId: a.accountId,
            provider: 'microsoft',
          }));
        }

        return JSON.stringify(result);
      } catch (err) {
        return JSON.stringify({ error: err.message || 'Failed to list productivity accounts' });
      }
    },
    {
      name: Tools.list_productivity_accounts,
      description:
        'List connected Google and Microsoft accounts. Use provider: "google", "microsoft", or "all" (default). Returns { google: [{ accountId }], microsoft: [{ accountId }] }. Use accountId with select_productivity_account to switch.',
      schema: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            enum: ['google', 'microsoft', 'all'],
            description: 'Filter by provider (default: all)',
          },
        },
        required: [],
      },
    },
  );

  const getActiveProductivityAccountTool = tool(
    async (rawInput) => {
      try {
        const provider = (rawInput?.provider || '').toLowerCase();
        if (!provider || !['google', 'microsoft'].includes(provider)) {
          return JSON.stringify({ error: 'provider is required: "google" or "microsoft"' });
        }
        const serverName = PROVIDER_MAP[provider];
        const activeAccount = await MCPActiveAccountStorage.getActiveAccount({
          userId: resolvedUserId,
          serverName,
          findToken: tokenMethods.findToken,
        });
        return JSON.stringify({
          provider,
          accountId: activeAccount || null,
        });
      } catch (err) {
        return JSON.stringify({ error: err.message || 'Failed to get active productivity account' });
      }
    },
    {
      name: Tools.get_active_productivity_account,
      description:
        'Get the currently active account for a provider. Required: provider ("google" or "microsoft"). Returns { provider, accountId } or accountId null if not set.',
      schema: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            enum: ['google', 'microsoft'],
            description: 'Provider to get active account for',
          },
        },
        required: ['provider'],
      },
    },
  );

  const selectProductivityAccountTool = tool(
    async (rawInput) => {
      try {
        const { provider, accountId } = rawInput || {};
        const prov = (provider || '').toLowerCase();
        if (!prov || !['google', 'microsoft'].includes(prov)) {
          return JSON.stringify({ error: 'provider is required: "google" or "microsoft"' });
        }
        if (!accountId || typeof accountId !== 'string') {
          return JSON.stringify({ error: 'accountId is required' });
        }
        const serverName = PROVIDER_MAP[prov];
        await MCPActiveAccountStorage.setActiveAccount({
          userId: resolvedUserId,
          serverName,
          accountId: accountId.trim(),
          createToken: tokenMethods.createToken,
          updateToken: tokenMethods.updateToken,
          findToken: tokenMethods.findToken,
        });
        return JSON.stringify({
          message: `Active ${provider} account set to ${accountId}`,
          provider: prov,
          accountId: accountId.trim(),
        });
      } catch (err) {
        return JSON.stringify({ error: err.message || 'Failed to select productivity account' });
      }
    },
    {
      name: Tools.select_productivity_account,
      description:
        'Set the active account for subsequent Google or Microsoft tool calls. Required: provider ("google" or "microsoft"), accountId (from list_productivity_accounts). All Gmail, Drive, Outlook, OneDrive, etc. calls will use this account until switched.',
      schema: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            enum: ['google', 'microsoft'],
            description: 'Provider to set active account for',
          },
          accountId: {
            type: 'string',
            description: 'Account ID (e.g. email or "default") from list_productivity_accounts',
          },
        },
        required: ['provider', 'accountId'],
      },
    },
  );

  const addProductivityAccountTool = tool(
    async (rawInput) => {
      try {
        const provider = (rawInput?.provider || '').toLowerCase();
        if (!provider || !['google', 'microsoft'].includes(provider)) {
          return JSON.stringify({ error: 'provider is required: "google" or "microsoft"' });
        }
        const serverName = PROVIDER_MAP[provider];

        const { getMCPServersRegistry, getMCPManager } = require('~/config');
        const serverConfig = await getMCPServersRegistry().getServerConfig(
          serverName,
          resolvedUserId,
        );
        if (!serverConfig) {
          return JSON.stringify({
            error: `${provider} is not configured. The administrator must add the ${serverName} MCP server.`,
          });
        }

        await getMCPManager().disconnectUserConnection(resolvedUserId, serverName);

        let userMCPAuthMap;
        if (serverConfig.customUserVars && typeof serverConfig.customUserVars === 'object') {
          userMCPAuthMap = await getUserMCPAuthMap({
            userId: resolvedUserId,
            servers: [serverName],
            findPluginAuthsByKeys,
          });
        }

        const result = await reinitMCPServer({
          user: { id: resolvedUserId, ...user },
          serverName,
          userMCPAuthMap,
          addAccount: true,
        });

        if (!result) {
          return JSON.stringify({ error: 'Failed to initiate account connection' });
        }

        if (result.oauthRequired && result.oauthUrl) {
          const { shortCode, connectUrl } = await createOAuthConnectUrl(result.oauthUrl);
          return JSON.stringify({
            shortCode,
            connectUrl,
            provider,
            message:
              `A sign-in link has been generated. Click the Connect button below to open it. ` +
              `The account will be saved only after you complete sign-in. ` +
              `When adding another account, the sign-in page will show an account chooser—click "Use another account" to sign in with a different ${provider} account. ` +
              `Once you're done, tell me and I'll list your accounts and switch to the new one.`,
          });
        }

        if (result.success && !result.oauthRequired) {
          return JSON.stringify({
            message: `You already have an authenticated ${provider} session. Use list_productivity_accounts to see connected accounts.`,
          });
        }

        return JSON.stringify({ error: result.message || 'Failed to initiate account connection' });
      } catch (err) {
        return JSON.stringify({ error: err.message || 'Failed to add productivity account' });
      }
    },
    {
      name: Tools.add_productivity_account,
      description:
        'Add a new Google or Microsoft account. Initiates OAuth—returns oauthUrl for the user to open and sign in. The account is saved only after the user completes sign-in. Use when the user wants to connect another account. Required: provider ("google" or "microsoft"). Tell the user to open the link, sign in, then tell you when done.',
      schema: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            enum: ['google', 'microsoft'],
            description: 'Provider to add account for',
          },
        },
        required: ['provider'],
      },
    },
  );

  const checkProductivityAccountsAuthTool = tool(
    async (rawInput) => {
      try {
        const provider = (rawInput?.provider || 'all').toLowerCase();
        const result = { google: [], microsoft: [] };
        const now = new Date();

        async function getAccountAuthStatus(serverName) {
          const accounts = await MCPTokenStorage.listAccountsForServer({
            userId: resolvedUserId,
            serverName,
            findTokens: tokenMethods.findTokens,
          });
          if (accounts.length === 0) {
            return [{ accountId: null, status: 'not_connected', expiresAt: null }];
          }
          const statuses = [];
          for (const { accountId } of accounts) {
            const identifier =
              accountId === 'default' ? `mcp:${serverName}` : `mcp:${serverName}:${accountId}`;
            const accessToken = await tokenMethods.findToken({
              userId: resolvedUserId,
              type: 'mcp_oauth',
              identifier,
            });
            if (!accessToken) {
              statuses.push({
                accountId,
                status: 'expired_needs_reauth',
                expiresAt: null,
              });
              continue;
            }
            const expiresAt = accessToken.expiresAt
              ? new Date(accessToken.expiresAt).toISOString()
              : null;
            const isExpired = accessToken.expiresAt && new Date(accessToken.expiresAt) <= now;
            const refreshToken = await tokenMethods.findToken({
              userId: resolvedUserId,
              type: 'mcp_oauth_refresh',
              identifier: `${identifier}:refresh`,
            });
            const hasRefresh = !!refreshToken;
            let status;
            if (!isExpired) {
              status = 'ok';
            } else if (hasRefresh) {
              status = 'expired_refreshable';
            } else {
              status = 'expired_needs_reauth';
            }
            statuses.push({ accountId, status, expiresAt });
          }
          return statuses;
        }

        if (provider === 'all' || provider === 'google') {
          result.google = await getAccountAuthStatus('Google');
        }
        if (provider === 'all' || provider === 'microsoft') {
          result.microsoft = await getAccountAuthStatus('Microsoft');
        }

        return JSON.stringify(result);
      } catch (err) {
        return JSON.stringify({ error: err.message || 'Failed to check productivity accounts auth' });
      }
    },
    {
      name: Tools.check_productivity_accounts_auth,
      description:
        'Check whether Google and Microsoft accounts need refresh or re-authentication. Use before Gmail, Drive, Outlook, etc. Returns per-account status: ok (valid), expired_refreshable (system will auto-refresh on next use), expired_needs_reauth (use reauthenticate_productivity_account), not_connected (no accounts). Provider: "google", "microsoft", or "all" (default).',
      schema: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            enum: ['google', 'microsoft', 'all'],
            description: 'Filter by provider (default: all)',
          },
        },
        required: [],
      },
    },
  );

  const reauthenticateProductivityAccountTool = tool(
    async (rawInput) => {
      try {
        const provider = (rawInput?.provider || '').toLowerCase();
        if (!provider || !['google', 'microsoft'].includes(provider)) {
          return JSON.stringify({ error: 'provider is required: "google" or "microsoft"' });
        }
        const serverName = PROVIDER_MAP[provider];

        const { getMCPServersRegistry, getMCPManager } = require('~/config');
        const serverConfig = await getMCPServersRegistry().getServerConfig(
          serverName,
          resolvedUserId,
        );
        if (!serverConfig) {
          return JSON.stringify({
            error: `${provider} is not configured. The administrator must add the ${serverName} MCP server.`,
          });
        }

        await getMCPManager().disconnectUserConnection(resolvedUserId, serverName);

        let userMCPAuthMap;
        if (serverConfig.customUserVars && typeof serverConfig.customUserVars === 'object') {
          userMCPAuthMap = await getUserMCPAuthMap({
            userId: resolvedUserId,
            servers: [serverName],
            findPluginAuthsByKeys,
          });
        }

        const result = await reinitMCPServer({
          user: { id: resolvedUserId, ...user },
          serverName,
          userMCPAuthMap,
          addAccount: false,
        });

        if (!result) {
          return JSON.stringify({ error: 'Failed to initiate re-authentication' });
        }

        if (result.oauthRequired && result.oauthUrl) {
          const { shortCode, connectUrl } = await createOAuthConnectUrl(result.oauthUrl);
          return JSON.stringify({
            shortCode,
            connectUrl,
            provider,
            message:
              `A sign-in link has been generated. Click the Connect button below to open it. ` +
              `Your ${provider} session needs to be re-authenticated. ` +
              `Once you're done, tell me and I'll verify your accounts are connected.`,
          });
        }

        if (result.success && !result.oauthRequired) {
          return JSON.stringify({
            message: `Your ${provider} session is already valid. Use list_productivity_accounts to see connected accounts.`,
          });
        }

        return JSON.stringify({ error: result.message || 'Failed to initiate re-authentication' });
      } catch (err) {
        return JSON.stringify({
          error: err.message || 'Failed to reauthenticate productivity account',
        });
      }
    },
    {
      name: Tools.reauthenticate_productivity_account,
      description:
        'Re-authenticate an existing Google or Microsoft account when tokens are expired or revoked. Initiates OAuth and returns oauthUrl for the user to open and sign in. Use after check_productivity_accounts_auth returns expired_needs_reauth, or when MCP calls fail with auth errors. Required: provider ("google" or "microsoft").',
      schema: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            enum: ['google', 'microsoft'],
            description: 'Provider to re-authenticate',
          },
        },
        required: ['provider'],
      },
    },
  );

  const removeProductivityAccountTool = tool(
    async (rawInput) => {
      try {
        const { provider, accountId } = rawInput || {};
        const prov = (provider || '').toLowerCase();
        if (!prov || !['google', 'microsoft'].includes(prov)) {
          return JSON.stringify({ error: 'provider is required: "google" or "microsoft"' });
        }
        if (!accountId || typeof accountId !== 'string') {
          return JSON.stringify({ error: 'accountId is required (from list_productivity_accounts)' });
        }
        const serverName = PROVIDER_MAP[prov];
        const accountIdTrimmed = accountId.trim();

        const existingAccounts = await MCPTokenStorage.listAccountsForServer({
          userId: resolvedUserId,
          serverName,
          findTokens: tokenMethods.findTokens,
        });
        const exists = existingAccounts.some(
          (a) => (a.accountId || '').toLowerCase() === accountIdTrimmed.toLowerCase(),
        );
        if (!exists) {
          return JSON.stringify({
            error: `Account "${accountIdTrimmed}" is not connected. Use list_productivity_accounts to see connected accounts.`,
          });
        }

        const activeAccount = await MCPActiveAccountStorage.getActiveAccount({
          userId: resolvedUserId,
          serverName,
          findToken: tokenMethods.findToken,
        });
        const wasActive =
          activeAccount && activeAccount.toLowerCase() === accountIdTrimmed.toLowerCase();

        await MCPTokenStorage.deleteAccountTokens({
          userId: resolvedUserId,
          serverName,
          accountId: accountIdTrimmed,
          deleteToken: async (filter) => {
            await Token.deleteOne(filter);
          },
        });

        if (wasActive) {
          const remaining = existingAccounts.filter(
            (a) => (a.accountId || '').toLowerCase() !== accountIdTrimmed.toLowerCase(),
          );
          if (remaining.length > 0) {
            await MCPActiveAccountStorage.setActiveAccount({
              userId: resolvedUserId,
              serverName,
              accountId: remaining[0].accountId,
              createToken: tokenMethods.createToken,
              updateToken: tokenMethods.updateToken,
              findToken: tokenMethods.findToken,
            });
          } else {
            await MCPActiveAccountStorage.clearActiveAccount({
              userId: resolvedUserId,
              serverName,
              deleteToken: async (filter) => {
                await Token.deleteOne(filter);
              },
            });
          }
        }

        const { getMCPManager } = require('~/config');
        await getMCPManager().disconnectUserConnection(resolvedUserId, serverName);

        return JSON.stringify({
          message: `${provider} account "${accountIdTrimmed}" has been removed.`,
          provider: prov,
          accountId: accountIdTrimmed,
        });
      } catch (err) {
        return JSON.stringify({
          error: err.message || 'Failed to remove productivity account',
        });
      }
    },
    {
      name: Tools.remove_productivity_account,
      description:
        'Remove a connected Google or Microsoft account. Required: provider ("google" or "microsoft"), accountId (from list_productivity_accounts). The account will be disconnected and tokens deleted. If it was the active account, another account will be selected.',
      schema: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            enum: ['google', 'microsoft'],
            description: 'Provider to remove account for',
          },
          accountId: {
            type: 'string',
            description: 'Account ID (e.g. email or "default") from list_productivity_accounts',
          },
        },
        required: ['provider', 'accountId'],
      },
    },
  );

  return {
    [Tools.list_productivity_accounts]: listProductivityAccountsTool,
    [Tools.get_active_productivity_account]: getActiveProductivityAccountTool,
    [Tools.select_productivity_account]: selectProductivityAccountTool,
    [Tools.add_productivity_account]: addProductivityAccountTool,
    [Tools.remove_productivity_account]: removeProductivityAccountTool,
    [Tools.check_productivity_accounts_auth]: checkProductivityAccountsAuthTool,
    [Tools.reauthenticate_productivity_account]: reauthenticateProductivityAccountTool,
  };
}

module.exports = { createProductivityAccountTools };
