const { logger } = require('@librechat/data-schemas');

/**
 * OAuth audit event types
 */
const OAuthAuditEvents = {
  MCP_OAUTH_REAUTH_REQUESTED: 'mcp_oauth_reauth_requested',
  MCP_OAUTH_REAUTH_LINK_ISSUED: 'mcp_oauth_reauth_link_issued',
  MCP_OAUTH_INITIATE: 'mcp_oauth_initiate',
  MCP_OAUTH_CALLBACK_SUCCESS: 'mcp_oauth_callback_success',
  MCP_OAUTH_CALLBACK_ERROR: 'mcp_oauth_callback_error',
  MCP_OAUTH_CONFIRM: 'mcp_oauth_confirm',
  MCP_OAUTH_REVOKE: 'mcp_oauth_revoke',
};

/**
 * Logs an OAuth audit event. Structured for log aggregation and tamper-evident audit trail.
 *
 * @param {Object} params
 * @param {string} params.event - OAuth audit event type
 * @param {string} [params.userId]
 * @param {string} [params.serverName]
 * @param {string} [params.result] - success, error, etc.
 * @param {string} [params.ip]
 * @param {string} [params.userAgent]
 * @param {string} [params.error]
 * @param {Record<string, unknown>} [params.extra]
 */
function logOAuthAudit({
  event,
  userId,
  serverName,
  result = 'success',
  ip,
  userAgent,
  error,
  extra = {},
}) {
  const entry = {
    audit: true,
    type: 'oauth',
    event,
    timestamp: new Date().toISOString(),
    userId: userId || null,
    serverName: serverName || null,
    result,
    ip: ip || null,
    userAgent: userAgent || null,
    error: error || null,
    ...extra,
  };
  logger.info('[OAuth Audit]', entry);
}

module.exports = {
  logOAuthAudit,
  OAuthAuditEvents,
};
