/**
 * Resolves the workspace session ID for code execution and workspace tools.
 * Always conversation-scoped when conversationId is available: each conversation
 * gets its own workspace. Ephemeral fallback for unsaved/new conversations.
 *
 * @param {Object} params
 * @param {string} [params.agentId]
 * @param {string} [params.userId]
 * @param {string} [params.conversationId]
 * @returns {string} Workspace session ID used for SESSION_BASE_DIR subdirectory
 */
function getWorkspaceSessionId({ agentId, userId, conversationId }) {
  if (conversationId && conversationId !== 'new') {
    return `conv_${conversationId}`;
  }
  return `local_${Date.now().toString(36)}`;
}

module.exports = { getWorkspaceSessionId };
