/**
 * Unit tests for getWorkspaceSessionId. Run: npm test -- workspaceKey.spec.js
 */
const { getWorkspaceSessionId } = require('../workspaceKey');

describe('getWorkspaceSessionId', () => {
  it('returns agent_user key when both agentId and userId are provided', () => {
    const result = getWorkspaceSessionId({
      agentId: 'agent-123',
      userId: 'user-456',
    });
    expect(result).toBe('agent_agent-123_user_user-456');
  });

  it('returns agent_user key when agentId, userId, and conversationId are provided (agent+user takes precedence)', () => {
    const result = getWorkspaceSessionId({
      agentId: 'agent-123',
      userId: 'user-456',
      conversationId: 'conv-789',
    });
    expect(result).toBe('agent_agent-123_user_user-456');
  });

  it('returns conv key when only conversationId is provided', () => {
    const result = getWorkspaceSessionId({
      conversationId: 'conv-abc',
    });
    expect(result).toBe('conv_conv-abc');
  });

  it('returns conv key when agentId is missing but userId and conversationId are provided', () => {
    const result = getWorkspaceSessionId({
      userId: 'user-456',
      conversationId: 'conv-abc',
    });
    expect(result).toBe('conv_conv-abc');
  });

  it('returns conv key when userId is missing but agentId and conversationId are provided', () => {
    const result = getWorkspaceSessionId({
      agentId: 'agent-123',
      conversationId: 'conv-abc',
    });
    expect(result).toBe('conv_conv-abc');
  });

  it('returns local timestamp when no params provided', () => {
    const result = getWorkspaceSessionId({});
    expect(result).toMatch(/^local_[a-z0-9]+$/);
  });

  it('returns local timestamp when all params are empty/falsy', () => {
    const result = getWorkspaceSessionId({
      agentId: '',
      userId: null,
      conversationId: undefined,
    });
    expect(result).toMatch(/^local_[a-z0-9]+$/);
  });
});
