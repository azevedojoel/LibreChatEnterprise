/**
 * Tests for scheduler - routes through runScheduleForUser, disables one-off after trigger
 */
const mockRunScheduleForUser = jest.fn();
const mockFindByIdAndUpdate = jest.fn();

jest.mock('../schedulingService', () => ({
  runScheduleForUser: (...args) => mockRunScheduleForUser(...args),
}));

jest.mock('~/db/models', () => ({
  ScheduledPrompt: {
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

jest.mock('cron-parser', () => ({
  parseExpression: jest.fn(() => ({
    next: () => ({
      toDate: () => {
        const d = new Date();
        d.setSeconds(d.getSeconds() - 30);
        return d;
      },
    }),
  })),
}));

const { ScheduledPrompt } = require('~/db/models');
const { processDueSchedules } = require('../scheduler');

describe('scheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunScheduleForUser.mockResolvedValue({ success: true, runId: 'run-1', status: 'queued' });
    ScheduledPrompt.findByIdAndUpdate.mockResolvedValue({});
  });

  it('should call runScheduleForUser with userId and scheduleId for each due schedule', async () => {
    const schedule = {
      _id: 'sched-1',
      userId: 'user-1',
      agentId: 'agent-1',
      prompt: 'Hi',
      scheduleType: 'one-off',
      runAt: new Date(Date.now() - 1000),
      selectedTools: ['a', 'b'],
    };
    ScheduledPrompt.find.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue([]),
    });
    ScheduledPrompt.find.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue([schedule]),
    });

    await processDueSchedules();

    expect(mockRunScheduleForUser).toHaveBeenCalledWith('user-1', 'sched-1');
  });

  it('should disable one-off schedule after successful trigger', async () => {
    const schedule = {
      _id: 'sched-1',
      userId: 'user-1',
      agentId: 'agent-1',
      prompt: 'Hi',
      scheduleType: 'one-off',
      runAt: new Date(Date.now() - 1000),
      selectedTools: [],
    };
    ScheduledPrompt.find.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue([]),
    });
    ScheduledPrompt.find.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue([schedule]),
    });
    mockRunScheduleForUser.mockResolvedValue({ success: true });

    await processDueSchedules();

    expect(ScheduledPrompt.findByIdAndUpdate).toHaveBeenCalledWith(
      'sched-1',
      { $set: { enabled: false } },
    );
  });

  it('should NOT disable one-off schedule when runScheduleForUser fails', async () => {
    const schedule = {
      _id: 'sched-1',
      userId: 'user-1',
      agentId: 'agent-1',
      prompt: 'Hi',
      scheduleType: 'one-off',
      runAt: new Date(Date.now() - 1000),
      selectedTools: [],
    };
    ScheduledPrompt.find.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue([]),
    });
    ScheduledPrompt.find.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue([schedule]),
    });
    mockRunScheduleForUser.mockResolvedValue({ success: false, error: 'Schedule not found' });

    await processDueSchedules();

    expect(ScheduledPrompt.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('should NOT disable recurring schedule after trigger', async () => {
    const schedule = {
      _id: 'sched-2',
      userId: 'user-1',
      agentId: 'agent-1',
      prompt: 'Hi',
      scheduleType: 'recurring',
      cronExpression: '* * * * *',
      selectedTools: [],
    };
    ScheduledPrompt.find.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue([schedule]),
    });
    ScheduledPrompt.find.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue([]),
    });

    await processDueSchedules();

    expect(mockRunScheduleForUser).toHaveBeenCalledWith('user-1', 'sched-2');
    expect(ScheduledPrompt.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
