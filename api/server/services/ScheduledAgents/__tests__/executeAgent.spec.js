/**
 * Tests for executeScheduledAgent - prompt resolution and successful run
 */
jest.mock('~/server/services/Endpoints/agents/build', () => jest.fn());
jest.mock('~/server/services/Endpoints/agents', () => ({
  initializeClient: jest.fn(),
}));

jest.mock('~/db/models', () => ({
  User: {
    findById: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: 'user-1', role: 'USER' }),
    }),
  },
  Conversation: { findOneAndUpdate: jest.fn().mockResolvedValue({}) },
  PromptGroup: {
    findById: jest.fn().mockReturnValue({
      populate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          productionId: { prompt: 'Hello' },
        }),
      }),
    }),
  },
  ScheduledPrompt: {
    findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    findById: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          name: 'Test Schedule',
          promptGroupId: 'pg-1',
        }),
      }),
    }),
  },
  ScheduledRun: { create: jest.fn() },
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn().mockResolvedValue({ endpoints: {} }),
}));

jest.mock('~/server/cleanup', () => ({
  disposeClient: jest.fn(),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

jest.mock('~/models/Agent', () => ({
  getAgent: jest.fn().mockResolvedValue({ _id: 'agent-1', id: 'agent-1', tools: [] }),
}));

jest.mock('~/server/services/PermissionService', () => ({
  checkPermission: jest.fn().mockResolvedValue(true),
}));

const buildOptions = require('~/server/services/Endpoints/agents/build');
const { initializeClient } = require('~/server/services/Endpoints/agents');
const { User, ScheduledRun } = require('~/db/models');
const { executeScheduledAgent } = require('../executeAgent');

describe('executeScheduledAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: 'user-1', role: 'USER' }),
    });
    ScheduledRun.create.mockResolvedValue({ _id: 'run-1' });
    buildOptions.mockResolvedValue({
      agent: { id: 'agent-1', tools: [] },
    });
    initializeClient.mockResolvedValue({
      client: {
        sendMessage: jest.fn().mockResolvedValue({
          databasePromise: Promise.resolve(),
        }),
      },
    });
  });

  it('should resolve prompt from PromptGroup and send resolved prompt to agent', async () => {
    const result = await executeScheduledAgent({
      scheduleId: 'sched-1',
      userId: 'user-1',
      agentId: 'agent-1',
    });

    expect(result.success).toBe(true);
    expect(buildOptions).toHaveBeenCalled();
    const capturedReq = buildOptions.mock.calls[0][0];
    expect(capturedReq.body.text).toBe('Hello');
  });

  it('should store resolved prompt in ScheduledRun on success', async () => {
    await executeScheduledAgent({
      scheduleId: 'sched-1',
      userId: 'user-1',
      agentId: 'agent-1',
    });

    expect(ScheduledRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Hello',
        status: 'success',
      }),
    );
  });
});
