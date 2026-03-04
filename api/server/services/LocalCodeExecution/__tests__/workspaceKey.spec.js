/**
 * Unit tests for getWorkspaceSessionId. Run: npm test -- workspaceKey.spec.js
 */
const { getWorkspaceSessionId } = require('../workspaceKey');

describe('getWorkspaceSessionId', () => {
  it('returns conv key when conversationId is provided (always conversation-scoped)', () => {
    const result = getWorkspaceSessionId({
      agentId: 'agent-123',
      userId: 'user-456',
      conversationId: 'conv-789',
    });
    expect(result).toBe('conv_conv-789');
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

  it('returns ephemeral key when conversationId is "new"', () => {
    const result = getWorkspaceSessionId({
      agentId: 'agent-123',
      userId: 'user-456',
      conversationId: 'new',
    });
    expect(result).toMatch(/^local_[a-z0-9]+$/);
  });

  it('returns ephemeral key when only agentId and userId are provided (no conversation)', () => {
    const result = getWorkspaceSessionId({
      agentId: 'agent-123',
      userId: 'user-456',
    });
    expect(result).toMatch(/^local_[a-z0-9]+$/);
  });

  it('returns ephemeral key when no params provided', () => {
    const result = getWorkspaceSessionId({});
    expect(result).toMatch(/^local_[a-z0-9]+$/);
  });

  it('returns ephemeral key when all params are empty/falsy', () => {
    const result = getWorkspaceSessionId({
      agentId: '',
      userId: null,
      conversationId: undefined,
    });
    expect(result).toMatch(/^local_[a-z0-9]+$/);
  });
});
