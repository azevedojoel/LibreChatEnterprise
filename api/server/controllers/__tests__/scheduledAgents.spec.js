/**
 * Tests for scheduled agents controller - createSchedule, updateSchedule, runSchedule with selectedTools
 */
const mockExecuteScheduledAgent = jest.fn();

jest.mock('~/server/services/ScheduledAgents/executeAgent', () => ({
  executeScheduledAgent: (...args) => mockExecuteScheduledAgent(...args),
}));

jest.mock('~/db/models', () => {
  const mockSave = jest.fn().mockResolvedValue(undefined);
  const createMockSchedule = (overrides = {}) => ({
    _id: overrides._id || 'sched-1',
    userId: 'user-1',
    agentId: 'agent-1',
    name: 'Test Schedule',
    promptGroupId: 'pg-1',
    scheduleType: 'recurring',
    cronExpression: '0 0 * * *',
    runAt: null,
    enabled: true,
    timezone: 'UTC',
    selectedTools: null,
    ...overrides,
    toObject() {
      return { ...this };
    },
    save: mockSave,
  });

  return {
    ScheduledPrompt: {
      find: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }),
      findOne: jest.fn(),
      create: jest.fn(),
    },
    ScheduledRun: {
      find: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
          }),
        }),
      }),
      findOne: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      }),
    },
    createMockSchedule,
  };
});

jest.mock('~/models/Conversation', () => ({
  getConvo: jest.fn().mockResolvedValue(null),
}));

jest.mock('~/models/Message', () => ({
  getMessages: jest.fn().mockResolvedValue([]),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn() },
}));

jest.mock('~/models/Agent', () => ({
  getAgent: jest.fn().mockResolvedValue({ _id: 'agent-1', id: 'agent-1' }),
}));

jest.mock('~/models/Prompt', () => ({
  getPromptGroup: jest.fn().mockResolvedValue({ _id: 'pg-1', name: 'Test Prompt' }),
}));

jest.mock('~/server/services/PermissionService', () => ({
  checkPermission: jest.fn().mockResolvedValue(true),
}));

const dbModels = require('~/db/models');
const { createSchedule, updateSchedule, runSchedule } = require('../scheduledAgents');

describe('scheduledAgents controller - selectedTools', () => {
  const mockReq = (overrides = {}) => ({
    user: { id: 'user-1', role: 'USER' },
    body: {},
    params: {},
    query: {},
    ...overrides,
  });

  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.end = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteScheduledAgent.mockResolvedValue({ success: true, conversationId: 'conv-1' });
  });

  describe('createSchedule', () => {
    it('should accept selectedTools in req.body and persist it', async () => {
      const created = {
        _id: 'sched-1',
        userId: 'user-1',
        agentId: 'agent-1',
        name: 'Test',
        promptGroupId: 'pg-1',
        scheduleType: 'recurring',
        cronExpression: '0 0 * * *',
        selectedTools: ['tool_a', 'tool_b'],
        toObject: () => ({ _id: 'sched-1', selectedTools: ['tool_a', 'tool_b'] }),
      };
      dbModels.ScheduledPrompt.create.mockResolvedValue(created);

      const req = mockReq({
        body: {
          name: 'Test',
          agentId: 'agent-1',
          promptGroupId: 'pg-1',
          scheduleType: 'recurring',
          cronExpression: '0 0 * * *',
          selectedTools: ['tool_a', 'tool_b'],
        },
      });
      const res = mockRes();

      await createSchedule(req, res);

      expect(dbModels.ScheduledPrompt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedTools: ['tool_a', 'tool_b'],
        }),
      );
    });

    it('should accept selectedTools: null and store null', async () => {
      const created = {
        _id: 'sched-1',
        userId: 'user-1',
        agentId: 'agent-1',
        name: 'Test',
        promptGroupId: 'pg-1',
        scheduleType: 'recurring',
        cronExpression: '0 0 * * *',
        selectedTools: null,
        toObject: () => ({ _id: 'sched-1', selectedTools: null }),
      };
      dbModels.ScheduledPrompt.create.mockResolvedValue(created);

      const req = mockReq({
        body: {
          name: 'Test',
          agentId: 'agent-1',
          promptGroupId: 'pg-1',
          scheduleType: 'recurring',
          cronExpression: '0 0 * * *',
          selectedTools: null,
        },
      });
      const res = mockRes();

      await createSchedule(req, res);

      expect(dbModels.ScheduledPrompt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedTools: null,
        }),
      );
    });

    it('should accept selectedTools: [] and store empty array', async () => {
      const created = {
        _id: 'sched-1',
        userId: 'user-1',
        agentId: 'agent-1',
        name: 'Test',
        promptGroupId: 'pg-1',
        scheduleType: 'recurring',
        cronExpression: '0 0 * * *',
        selectedTools: [],
        toObject: () => ({ _id: 'sched-1', selectedTools: [] }),
      };
      dbModels.ScheduledPrompt.create.mockResolvedValue(created);

      const req = mockReq({
        body: {
          name: 'Test',
          agentId: 'agent-1',
          promptGroupId: 'pg-1',
          scheduleType: 'recurring',
          cronExpression: '0 0 * * *',
          selectedTools: [],
        },
      });
      const res = mockRes();

      await createSchedule(req, res);

      expect(dbModels.ScheduledPrompt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedTools: [],
        }),
      );
    });
  });

  describe('updateSchedule', () => {
    it('should update selectedTools when provided in req.body', async () => {
      const schedule = {
        _id: 'sched-1',
        userId: 'user-1',
        agentId: 'agent-1',
        name: 'Test',
        promptGroupId: 'pg-1',
        scheduleType: 'recurring',
        cronExpression: '0 0 * * *',
        selectedTools: null,
        save: jest.fn().mockResolvedValue(undefined),
        toObject: () => ({ _id: 'sched-1', selectedTools: ['tool_x'] }),
      };
      dbModels.ScheduledPrompt.findOne.mockResolvedValue(schedule);

      const req = mockReq({
        params: { id: 'sched-1' },
        body: { selectedTools: ['tool_x'] },
      });
      const res = mockRes();

      await updateSchedule(req, res);

      expect(schedule.selectedTools).toEqual(['tool_x']);
      expect(schedule.save).toHaveBeenCalled();
    });

    it('should support selectedTools: null and selectedTools: []', async () => {
      const schedule = {
        _id: 'sched-1',
        userId: 'user-1',
        selectedTools: ['tool_a'],
        save: jest.fn().mockResolvedValue(undefined),
        toObject: () => ({ _id: 'sched-1' }),
      };
      dbModels.ScheduledPrompt.findOne.mockResolvedValue(schedule);

      await updateSchedule(
        mockReq({ params: { id: 'sched-1' }, body: { selectedTools: null } }),
        mockRes(),
      );
      expect(schedule.selectedTools).toBeNull();

      schedule.selectedTools = ['tool_a'];
      await updateSchedule(
        mockReq({ params: { id: 'sched-1' }, body: { selectedTools: [] } }),
        mockRes(),
      );
      expect(schedule.selectedTools).toEqual([]);
    });
  });

  describe('runSchedule', () => {
    it('should pass schedule.selectedTools to executeScheduledAgent', async () => {
      dbModels.ScheduledPrompt.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'sched-1',
          userId: 'user-1',
          agentId: 'agent-1',
          promptGroupId: 'pg-1',
          selectedTools: ['tool_a', 'tool_b'],
        }),
      });

      const req = mockReq({ params: { id: 'sched-1' } });
      const res = mockRes();

      await runSchedule(req, res);

      expect(mockExecuteScheduledAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedTools: ['tool_a', 'tool_b'],
        }),
      );
    });
  });
});
