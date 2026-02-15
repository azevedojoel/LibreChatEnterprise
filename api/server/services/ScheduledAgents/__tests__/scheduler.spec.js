/**
 * Tests for scheduler - selectedTools pass-through to executeScheduledAgent
 */
const mockExecuteScheduledAgent = jest.fn();
const mockFind = jest.fn();
const mockFindByIdAndUpdate = jest.fn();

jest.mock('../executeAgent', () => ({
  executeScheduledAgent: (...args) => mockExecuteScheduledAgent(...args),
}));

jest.mock('~/db/models', () => ({
  ScheduledAgent: {
    find: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  },
}));

jest.mock('@librechat/api', () => ({
  isLeader: jest.fn().mockResolvedValue(true),
}), { virtual: true });

jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const { ScheduledAgent } = require('~/db/models');
const { processDueSchedules } = require('../scheduler');

describe('scheduler - selectedTools pass-through', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteScheduledAgent.mockResolvedValue({ success: true });
    ScheduledAgent.findByIdAndUpdate.mockResolvedValue({});
  });

  it('should pass selectedTools to executeScheduledAgent when schedule has selectedTools array', async () => {
    const schedule = {
      _id: 'sched-1',
      userId: 'user-1',
      agentId: 'agent-1',
      prompt: 'Hi',
      scheduleType: 'one-off',
      runAt: new Date(Date.now() - 1000),
      selectedTools: ['a', 'b'],
    };
    ScheduledAgent.find.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue([]),
    });
    ScheduledAgent.find.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue([schedule]),
    });

    await processDueSchedules();

    expect(mockExecuteScheduledAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedTools: ['a', 'b'],
      }),
    );
  });

  it('should pass selectedTools: null when schedule has selectedTools null', async () => {
    const schedule = {
      _id: 'sched-1',
      userId: 'user-1',
      agentId: 'agent-1',
      prompt: 'Hi',
      scheduleType: 'one-off',
      runAt: new Date(Date.now() - 1000),
      selectedTools: null,
    };
    ScheduledAgent.find.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue([]),
    });
    ScheduledAgent.find.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue([schedule]),
    });

    await processDueSchedules();

    expect(mockExecuteScheduledAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedTools: null,
      }),
    );
  });

  it('should pass selectedTools: [] when schedule has empty array', async () => {
    const schedule = {
      _id: 'sched-1',
      userId: 'user-1',
      agentId: 'agent-1',
      prompt: 'Hi',
      scheduleType: 'one-off',
      runAt: new Date(Date.now() - 1000),
      selectedTools: [],
    };
    ScheduledAgent.find.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue([]),
    });
    ScheduledAgent.find.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue([schedule]),
    });

    await processDueSchedules();

    expect(mockExecuteScheduledAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedTools: [],
      }),
    );
  });
});
