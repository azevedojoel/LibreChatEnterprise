/**
 * Tests for removeMCPFromUserAgents and disablePermanentlyFailedServer.
 * Covers MCP deletion agent cleanup when config is missing or server permanently fails.
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
  Constants: {
    mcp_prefix: 'mcp_',
    mcp_delimiter: '_mcp_',
  },
}));

const mockUpdateAgent = jest.fn().mockResolvedValue({});
const mockAgentFind = jest.fn();
const mockUserFindById = jest.fn();

jest.mock('~/db/models', () => ({
  Agent: {
    find: jest.fn(function fn() {
      return { lean: () => mockAgentFind() };
    }),
  },
  User: {
    findById: jest.fn(function fn() {
      return { lean: () => mockUserFindById() };
    }),
  },
}));

jest.mock('~/models/Agent', () => ({
  updateAgent: (...args) => mockUpdateAgent(...args),
}));

jest.mock('~/config', () => ({
  getMCPManager: jest.fn(),
}));

jest.mock('~/server/services/Config/getCachedTools', () => ({
  invalidateCachedTools: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('~/models', () => ({
  updateUserPlugins: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('~/server/services/PluginService', () => ({
  deleteUserPluginAuth: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('~/server/services/MCP/oauthUninstall', () => ({
  uninstallOAuthMCP: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn().mockResolvedValue({}),
}));

const { logger } = require('@librechat/data-schemas');
const { removeMCPFromUserAgents, disablePermanentlyFailedServer } = require('../disablePermanentlyFailedServer');
const { getMCPManager } = require('~/config');
const { invalidateCachedTools } = require('~/server/services/Config/getCachedTools');

describe('removeMCPFromUserAgents', () => {
  const userId = 'user-123';
  const serverName = 'GoogleAds';
  const serverToolSuffix = `_mcp_${serverName}`;

  let mockDisconnectUserConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDisconnectUserConnection = jest.fn().mockResolvedValue(undefined);
    getMCPManager.mockReturnValue({
      disconnectUserConnection: mockDisconnectUserConnection,
    });
    mockAgentFind.mockResolvedValue([]);
  });

  it('removes MCP tools from agents that reference the server', async () => {
    const agentWithTools = {
      id: 'agent-1',
      author: userId,
      mcpServerNames: [serverName],
      tools: [`tasks_listTasks${serverToolSuffix}`, `web_search`, `other_tool_mcp_Google`],
      versions: null,
    };
    mockAgentFind.mockResolvedValue([agentWithTools]);

    await removeMCPFromUserAgents(userId, serverName);

    expect(mockUpdateAgent).toHaveBeenCalledWith(
      { id: 'agent-1', author: userId },
      { tools: ['web_search', 'other_tool_mcp_Google'] },
      expect.objectContaining({
        updatingUserId: userId,
        skipVersioning: false,
      }),
    );
  });

  it('preserves tools from other MCP servers', async () => {
    const agentWithTools = {
      id: 'agent-1',
      author: userId,
      mcpServerNames: [serverName, 'Google'],
      tools: [
        `tasks_listTasks${serverToolSuffix}`,
        `calendar_listEvents_mcp_Google`,
      ],
      versions: null,
    };
    mockAgentFind.mockResolvedValue([agentWithTools]);

    await removeMCPFromUserAgents(userId, serverName);

    expect(mockUpdateAgent).toHaveBeenCalledWith(
      { id: 'agent-1', author: userId },
      { tools: ['calendar_listEvents_mcp_Google'] },
      expect.any(Object),
    );
  });

  it('uses versions[last].tools when agent has versions', async () => {
    const agentWithVersions = {
      id: 'agent-1',
      author: userId,
      mcpServerNames: [serverName],
      tools: ['legacy_tool'],
      versions: [
        { tools: ['v1_tool'] },
        { tools: [`tasks_listTasks${serverToolSuffix}`, 'keep_tool'] },
      ],
    };
    mockAgentFind.mockResolvedValue([agentWithVersions]);

    await removeMCPFromUserAgents(userId, serverName);

    expect(mockUpdateAgent).toHaveBeenCalledWith(
      expect.any(Object),
      { tools: ['keep_tool'] },
      expect.any(Object),
    );
  });

  it('does not call updateAgent when no tools need removal', async () => {
    const agentNoMCPTools = {
      id: 'agent-1',
      author: userId,
      mcpServerNames: [serverName],
      tools: ['web_search', 'execute_code'],
      versions: null,
    };
    mockAgentFind.mockResolvedValue([agentNoMCPTools]);

    await removeMCPFromUserAgents(userId, serverName);

    expect(mockUpdateAgent).not.toHaveBeenCalled();
  });

  it('disconnects MCP connection and invalidates cache when no agents found', async () => {
    mockAgentFind.mockResolvedValue([]);

    await removeMCPFromUserAgents(userId, serverName);

    expect(mockDisconnectUserConnection).toHaveBeenCalledWith(userId, serverName);
    expect(invalidateCachedTools).toHaveBeenCalledWith({ userId, serverName });
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining(`Removed MCP server "${serverName}"`),
    );
  });

  it('continues when Agent.find throws', async () => {
    mockAgentFind.mockRejectedValue(new Error('DB connection failed'));

    await removeMCPFromUserAgents(userId, serverName);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error removing server from agents'),
      expect.any(Error),
    );
    expect(mockDisconnectUserConnection).toHaveBeenCalledWith(userId, serverName);
    expect(invalidateCachedTools).toHaveBeenCalledWith({ userId, serverName });
  });

  it('continues when disconnectUserConnection throws', async () => {
    mockDisconnectUserConnection.mockRejectedValue(new Error('Disconnect failed'));

    await removeMCPFromUserAgents(userId, serverName);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error disconnecting MCP'),
      expect.any(Error),
    );
    expect(invalidateCachedTools).toHaveBeenCalledWith({ userId, serverName });
  });

  it('continues when invalidateCachedTools throws', async () => {
    invalidateCachedTools.mockRejectedValue(new Error('Cache unavailable'));

    await removeMCPFromUserAgents(userId, serverName);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error invalidating cache'),
      expect.any(Error),
    );
  });

  it('skips disconnect when getMCPManager returns null', async () => {
    getMCPManager.mockReturnValue(null);

    await removeMCPFromUserAgents(userId, serverName);

    expect(mockDisconnectUserConnection).not.toHaveBeenCalled();
    expect(invalidateCachedTools).toHaveBeenCalledWith({ userId, serverName });
  });

  it('updates multiple agents when user has several', async () => {
    const agents = [
      { id: 'agent-1', author: userId, mcpServerNames: [serverName], tools: [`a${serverToolSuffix}`], versions: null },
      { id: 'agent-2', author: userId, mcpServerNames: [serverName], tools: [`b${serverToolSuffix}`, 'keep'], versions: null },
    ];
    mockAgentFind.mockResolvedValue(agents);

    await removeMCPFromUserAgents(userId, serverName);

    expect(mockUpdateAgent).toHaveBeenCalledTimes(2);
    expect(mockUpdateAgent).toHaveBeenNthCalledWith(1, { id: 'agent-1', author: userId }, { tools: [] }, expect.any(Object));
    expect(mockUpdateAgent).toHaveBeenNthCalledWith(2, { id: 'agent-2', author: userId }, { tools: ['keep'] }, expect.any(Object));
  });
});

describe('disablePermanentlyFailedServer', () => {
  const userId = 'user-456';
  const serverName = 'Google';

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindById.mockResolvedValue({ id: userId, plugins: [] });
  });

  it('invokes removeMCPFromUserAgents after plugin and auth cleanup', async () => {
    const { updateUserPlugins } = require('~/models');
    const { deleteUserPluginAuth } = require('~/server/services/PluginService');
    const { getAppConfig } = require('~/server/services/Config');
    const { uninstallOAuthMCP } = require('../oauthUninstall');

    await disablePermanentlyFailedServer(userId, serverName);

    expect(updateUserPlugins).toHaveBeenCalled();
    expect(deleteUserPluginAuth).toHaveBeenCalled();
    expect(getAppConfig).toHaveBeenCalled();
    expect(uninstallOAuthMCP).toHaveBeenCalled();
    expect(getMCPManager).toHaveBeenCalled();
    expect(invalidateCachedTools).toHaveBeenCalledWith({ userId, serverName });
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Successfully disabled MCP server'),
    );
  });
});
