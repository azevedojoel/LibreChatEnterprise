/**
 * Tests for executeScheduledAgent - selectedTools propagation to mockReq.body.ephemeralAgent
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
  ScheduledAgent: {
    findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    findById: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ name: 'Test Schedule' }),
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
  loadAgent: jest.fn().mockResolvedValue({ id: 'agent-1', tools: [] }),
}));

const buildOptions = require('~/server/services/Endpoints/agents/build');
const { initializeClient } = require('~/server/services/Endpoints/agents');
const { User, ScheduledRun } = require('~/db/models');
const { executeScheduledAgent } = require('../executeAgent');

describe('executeScheduledAgent - selectedTools propagation', () => {
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

  it('should set mockReq.body.ephemeralAgent when selectedTools is an array', async () => {
    const result = await executeScheduledAgent({
      scheduleId: 'sched-1',
      userId: 'user-1',
      agentId: 'agent-1',
      prompt: 'Hello',
      selectedTools: ['tool_a', 'tool_b'],
    });

    expect(result.success).toBe(true);
    expect(buildOptions).toHaveBeenCalled();
    const capturedReq = buildOptions.mock.calls[0][0];
    expect(capturedReq.body.ephemeralAgent).toEqual({ tools: ['tool_a', 'tool_b'] });
  });

  it('should set mockReq.body.ephemeralAgent to empty tools when selectedTools is []', async () => {
    await executeScheduledAgent({
      scheduleId: 'sched-1',
      userId: 'user-1',
      agentId: 'agent-1',
      prompt: 'Hello',
      selectedTools: [],
    });

    expect(buildOptions).toHaveBeenCalled();
    const capturedReq = buildOptions.mock.calls[0][0];
    expect(capturedReq.body.ephemeralAgent).toEqual({ tools: [] });
  });

  it('should NOT set ephemeralAgent when selectedTools is undefined', async () => {
    await executeScheduledAgent({
      scheduleId: 'sched-1',
      userId: 'user-1',
      agentId: 'agent-1',
      prompt: 'Hello',
    });

    expect(buildOptions).toHaveBeenCalled();
    const capturedReq = buildOptions.mock.calls[0][0];
    expect(capturedReq.body.ephemeralAgent).toBeUndefined();
  });

  it('should NOT set ephemeralAgent when selectedTools is null', async () => {
    await executeScheduledAgent({
      scheduleId: 'sched-1',
      userId: 'user-1',
      agentId: 'agent-1',
      prompt: 'Hello',
      selectedTools: null,
    });

    expect(buildOptions).toHaveBeenCalled();
    const capturedReq = buildOptions.mock.calls[0][0];
    expect(capturedReq.body.ephemeralAgent).toBeUndefined();
  });
});
