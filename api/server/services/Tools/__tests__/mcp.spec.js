/**
 * Tests for reinitMCPServer, focusing on config-not-found behavior and MCP agent cleanup.
 */
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('librechat-data-provider', () => ({
  CacheKeys: { FLOWS: 'flows' },
  Constants: {
    mcp_prefix: 'mcp_',
    mcp_delimiter: '_mcp_',
  },
  Time: { ONE_DAY: 86400000 },
}));

const mockRemoveMCPFromUserAgents = jest.fn().mockResolvedValue(undefined);
jest.mock('~/server/services/MCP/disablePermanentlyFailedServer', () => ({
  removeMCPFromUserAgents: (...args) => mockRemoveMCPFromUserAgents(...args),
}));

const mockGetConnection = jest.fn();
const mockDiscoverServerTools = jest.fn();
jest.mock('~/config', () => ({
  getMCPManager: jest.fn(() => ({
    getConnection: (...args) => mockGetConnection(...args),
    discoverServerTools: (...args) => mockDiscoverServerTools(...args),
  })),
  getFlowStateManager: jest.fn(() => ({})),
}));

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(() => ({})),
}));

jest.mock('~/models', () => ({
  findToken: jest.fn(),
  createToken: jest.fn(),
  updateToken: jest.fn(),
  deleteTokens: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({
  updateMCPServerTools: jest.fn().mockResolvedValue({}),
}));

const { reinitMCPServer } = require('../mcp');
const { logger } = require('@librechat/data-schemas');

describe('reinitMCPServer', () => {
  const userId = 'user-789';
  const serverName = 'GoogleAds';
  const user = { id: userId, email: 'test@example.com' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRemoveMCPFromUserAgents.mockResolvedValue(undefined);
  });

  describe('config-not-found agent cleanup', () => {
    const configNotFoundError = new Error(
      `[MCP][User: ${userId}] Configuration for server "${serverName}" not found.`,
    );

    it('calls removeMCPFromUserAgents when getConnection throws config not found', async () => {
      mockGetConnection.mockRejectedValue(configNotFoundError);
      mockDiscoverServerTools.mockResolvedValue({ tools: null });

      const result = await reinitMCPServer({
        user,
        serverName,
      });

      expect(mockRemoveMCPFromUserAgents).toHaveBeenCalledWith(userId, serverName);
      expect(result).toBeDefined();
      expect(result?.success).toBe(false);
    });

    it('does NOT call removeMCPFromUserAgents when user.id is missing', async () => {
      mockGetConnection.mockRejectedValue(configNotFoundError);
      mockDiscoverServerTools.mockResolvedValue({ tools: null });

      await reinitMCPServer({
        user: { email: 'test@example.com' },
        serverName,
      });

      expect(mockRemoveMCPFromUserAgents).not.toHaveBeenCalled();
    });

    it('does NOT call removeMCPFromUserAgents when error is OAuth-related', async () => {
      const oauthError = new Error('OAuth token expired - authentication required');
      mockGetConnection.mockRejectedValue(oauthError);
      mockDiscoverServerTools.mockResolvedValue({ tools: [] });

      await reinitMCPServer({
        user,
        serverName,
      });

      expect(mockRemoveMCPFromUserAgents).not.toHaveBeenCalled();
    });

    it('does NOT call removeMCPFromUserAgents when error lacks "Configuration for server"', async () => {
      const otherError = new Error('Connection timeout');
      mockGetConnection.mockRejectedValue(otherError);

      await reinitMCPServer({
        user,
        serverName,
      });

      expect(mockRemoveMCPFromUserAgents).not.toHaveBeenCalled();
    });

    it('does NOT call removeMCPFromUserAgents when error lacks "not found"', async () => {
      const partialError = new Error('Configuration for server "X" is invalid');
      mockGetConnection.mockRejectedValue(partialError);

      await reinitMCPServer({
        user,
        serverName,
      });

      expect(mockRemoveMCPFromUserAgents).not.toHaveBeenCalled();
    });

    it('logs cleanup error when removeMCPFromUserAgents rejects but does not throw', async () => {
      mockGetConnection.mockRejectedValue(configNotFoundError);
      mockRemoveMCPFromUserAgents.mockRejectedValue(new Error('Cleanup failed'));

      const result = await reinitMCPServer({
        user,
        serverName,
      });

      expect(mockRemoveMCPFromUserAgents).toHaveBeenCalledWith(userId, serverName);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error removing orphaned MCP'),
        expect.any(Error),
      );
      expect(result).toBeDefined();
    });

    it('invokes cleanup fire-and-forget without blocking return', async () => {
      let resolveCleanup;
      const cleanupPromise = new Promise((r) => {
        resolveCleanup = r;
      });
      mockGetConnection.mockRejectedValue(configNotFoundError);
      mockRemoveMCPFromUserAgents.mockImplementation(() => cleanupPromise);

      const resultPromise = reinitMCPServer({ user, serverName });
      const result = await resultPromise;

      expect(result).toBeDefined();
      expect(mockRemoveMCPFromUserAgents).toHaveBeenCalledWith(userId, serverName);
      resolveCleanup();
      await cleanupPromise;
    });
  });

  describe('successful connection', () => {
    it('does not call removeMCPFromUserAgents when getConnection succeeds', async () => {
      const mockConnection = {
        fetchTools: jest.fn().mockResolvedValue([{ name: 'tool1', type: 'function' }]),
      };
      mockGetConnection.mockResolvedValue(mockConnection);

      const result = await reinitMCPServer({
        user,
        serverName,
      });

      expect(mockRemoveMCPFromUserAgents).not.toHaveBeenCalled();
      expect(result?.success).toBe(true);
    });
  });
});
