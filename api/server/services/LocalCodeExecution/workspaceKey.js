/**
 * Resolves the workspace session ID for code execution and workspace tools.
 * Agent-user scope enables file persistence across conversations for the same user and agent.
 *
 * @param {Object} params
 * @param {string} [params.agentId]
 * @param {string} [params.userId]
 * @param {string} [params.conversationId]
 * @returns {string} Workspace session ID used for SESSION_BASE_DIR subdirectory
 */
function getWorkspaceSessionId({ agentId, userId, conversationId }) {
  if (agentId && userId) {
    return `agent_${agentId}_user_${userId}`;
  }
  if (conversationId) {
    return `conv_${conversationId}`;
  }
  return `local_${Date.now().toString(36)}`;
}

module.exports = { getWorkspaceSessionId };
