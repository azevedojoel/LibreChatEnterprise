const crypto = require('crypto');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');
const { logOAuthAudit, OAuthAuditEvents } = require('./auditLog');

const REAUTH_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Creates a single-use, short-lived reauth token for MCP OAuth (headless/email flows).
 * Token is bound to userId + serverName + optional scopes.
 *
 * @param {Object} params
 * @param {string} params.userId - User ID
 * @param {string} params.serverName - MCP server name (connector)
 * @param {string} [params.scopes] - Optional OAuth scopes
 * @returns {Promise<string>} Plain token to include in the reauth link
 */
async function createReauthToken({ userId, serverName, scopes }) {
  const plainToken = crypto.randomBytes(32).toString('base64url');
  const cache = getLogStores(CacheKeys.MCP_REAUTH_TOKENS);
  const payload = {
    userId,
    serverName,
    scopes: scopes || null,
    createdAt: Date.now(),
    used: false,
  };
  await cache.set(plainToken, payload, REAUTH_TTL_MS);
  logOAuthAudit({
    event: OAuthAuditEvents.MCP_OAUTH_REAUTH_LINK_ISSUED,
    userId,
    serverName,
    result: 'success',
    extra: { tokenPreview: `${plainToken.slice(0, 8)}...` },
  });
  return plainToken;
}

/**
 * Consumes a reauth token (single-use). Validates and returns payload, then deletes.
 *
 * @param {string} token - Plain token from URL
 * @returns {Promise<{ userId: string, serverName: string, scopes?: string } | null>} Payload if valid
 */
async function consumeReauthToken(token) {
  if (!token || typeof token !== 'string' || !token.trim()) {
    return null;
  }
  const cache = getLogStores(CacheKeys.MCP_REAUTH_TOKENS);
  const payload = await cache.get(token);
  if (!payload) {
    logger.warn('[MCP Reauth] Token not found or expired', {
      tokenPreview: `${String(token).slice(0, 8)}...`,
    });
    return null;
  }
  if (payload.used) {
    logger.warn('[MCP Reauth] Token already used', { serverName: payload.serverName });
    await cache.delete(token);
    return null;
  }
  const now = Date.now();
  const age = now - (payload.createdAt || 0);
  if (age > REAUTH_TTL_MS) {
    logger.warn('[MCP Reauth] Token expired', {
      serverName: payload.serverName,
      ageMs: age,
    });
    await cache.delete(token);
    return null;
  }
  await cache.delete(token);
  return {
    userId: payload.userId,
    serverName: payload.serverName,
    scopes: payload.scopes || undefined,
  };
}

/**
 * Builds the app reauth link (to send in email instead of raw OAuth URL).
 * Points to the API route which validates token and redirects to OAuth provider.
 *
 * @param {string} token - Plain reauth token
 * @returns {string} Full URL to the app reauth endpoint
 */
function buildReauthLink(token) {
  const baseUrl = process.env.DOMAIN_CLIENT || process.env.DOMAIN_SERVER || 'http://localhost:3080';
  const path = `/api/mcp/reauth`;
  const url = new URL(path, baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

module.exports = {
  createReauthToken,
  consumeReauthToken,
  buildReauthLink,
};
