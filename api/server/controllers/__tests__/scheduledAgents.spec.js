/**
 * Tests for scheduled agents controller - createSchedule, updateSchedule, runSchedule with selectedTools
 */
const mockExecuteScheduledAgent = jest.fn();
const mockListSchedulesForUser = jest.fn();
const mockListRunsForUser = jest.fn();

jest.mock('@librechat/api', () => ({
  generateCheckAccess: () => (req, res, next) => next(),
  cacheConfig: {},
}), { virtual: true });

jest.mock('~/server/services/ScheduledAgents/executeAgent', () => ({
  executeScheduledAgent: (...args) => mockExecuteScheduledAgent(...args),
}));

const mockRunScheduleForUser = jest.fn();
const mockCreateScheduleForUser = jest.fn();
const mockUpdateScheduleForUser = jest.fn();
jest.mock('~/server/services/ScheduledAgents/schedulingService', () => {
  const mockActual = jest.requireActual('~/server/services/ScheduledAgents/schedulingService');
  return {
    ...mockActual,
    listSchedulesForUser: (...args) => mockListSchedulesForUser(...args),
    listRunsForUser: (...args) => mockListRunsForUser(...args),
    runScheduleForUser: (...args) => mockRunScheduleForUser(...args),
    createScheduleForUser: (...args) => mockCreateScheduleForUser(...args),
    updateScheduleForUser: (...args) => mockUpdateScheduleForUser(...args),
  };
});

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
      countDocuments: jest.fn().mockResolvedValue(0),
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
      create: jest.fn().mockResolvedValue({ _id: { toString: () => 'run-1' } }),
      countDocuments: jest.fn().mockResolvedValue(0),
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


jest.mock('~/server/services/PermissionService', () => ({
  checkPermission: jest.fn().mockResolvedValue(true),
}));

jest.mock('~/models/Role', () => ({
  getRoleByName: jest.fn().mockResolvedValue({ _id: 'role-1', name: 'USER' }),
}));

const dbModels = require('~/db/models');
const { createSchedule, updateSchedule, runSchedule, listSchedules, listRuns } = require('../scheduledAgents');

const VALID_USER_ID = '507f1f77bcf86cd799439011';

describe('scheduledAgents controller - selectedTools', () => {
  const mockReq = (overrides = {}) => ({
    user: { id: VALID_USER_ID, role: 'USER' },
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
    mockListSchedulesForUser.mockResolvedValue([]);
    mockListRunsForUser.mockResolvedValue([]);
    mockRunScheduleForUser.mockResolvedValue({
      success: true,
      runId: 'run-1',
      status: 'queued',
      conversationId: 'conv-1',
    });
    mockCreateScheduleForUser.mockImplementation((...args) =>
      jest.requireActual('~/server/services/ScheduledAgents/schedulingService').createScheduleForUser(...args),
    );
    mockUpdateScheduleForUser.mockImplementation((...args) =>
      jest.requireActual('~/server/services/ScheduledAgents/schedulingService').updateScheduleForUser(...args),
    );
  });

  describe('listSchedules', () => {
    it('should pass promptGroupId to schedulingService when provided in query', async () => {
      mockListSchedulesForUser.mockResolvedValue([{ _id: 'sched-1', promptGroupId: 'pg-1' }]);

      const req = mockReq({ query: { promptGroupId: 'pg-1' } });
      const res = mockRes();

      await listSchedules(req, res);

      expect(mockListSchedulesForUser).toHaveBeenCalledWith(VALID_USER_ID, { promptGroupId: 'pg-1' });
      expect(res.json).toHaveBeenCalledWith([{ _id: 'sched-1', promptGroupId: 'pg-1' }]);
    });

    it('should not pass promptGroupId when not in query', async () => {
      const req = mockReq({ query: {} });
      const res = mockRes();

      await listSchedules(req, res);

      expect(mockListSchedulesForUser).toHaveBeenCalledWith(VALID_USER_ID, {});
      expect(res.json).toHaveBeenCalledWith([]);
    });
  });

  describe('listRuns', () => {
    it('should pass limit and promptGroupId to schedulingService when provided', async () => {
      mockListRunsForUser.mockResolvedValue([{ _id: 'run-1', scheduleId: 'sched-1' }]);

      const req = mockReq({ query: { promptGroupId: 'pg-1', limit: '10' } });
      const res = mockRes();

      await listRuns(req, res);

      expect(mockListRunsForUser).toHaveBeenCalledWith(VALID_USER_ID, {
        limit: '10',
        promptGroupId: 'pg-1',
      });
      expect(res.json).toHaveBeenCalledWith([{ _id: 'run-1', scheduleId: 'sched-1' }]);
    });

    it('should pass only limit when promptGroupId is not provided', async () => {
      const req = mockReq({ query: { limit: '5' } });
      const res = mockRes();

      await listRuns(req, res);

      expect(mockListRunsForUser).toHaveBeenCalledWith(VALID_USER_ID, { limit: '5' });
    });
  });

  describe('createSchedule', () => {
    it('should accept selectedTools in req.body and persist it', async () => {
      const created = {
        _id: 'sched-1',
        userId: 'user-1',
        agentId: 'agent-1',
        name: 'Test',
        prompt: 'Run daily summary',
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
          prompt: 'Run daily summary',
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
        prompt: 'Run daily summary',
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
          prompt: 'Run daily summary',
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
        prompt: 'Run daily summary',
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
          prompt: 'Run daily summary',
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

    it('should return 400 when prompt is missing', async () => {
      const req = mockReq({
        body: {
          name: 'Test',
          agentId: 'agent-1',
          scheduleType: 'recurring',
          cronExpression: '0 0 * * *',
        },
      });
      const res = mockRes();

      await createSchedule(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('prompt'),
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
    it('should call runScheduleForUser and return success with runId and conversationId', async () => {
      const req = mockReq({ params: { id: 'sched-1' } });
      const res = mockRes();

      await runSchedule(req, res);

      expect(mockRunScheduleForUser).toHaveBeenCalledWith(VALID_USER_ID, 'sched-1');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        runId: 'run-1',
        status: 'queued',
        conversationId: 'conv-1',
      });
    });

    it('should return 429 when throttled (too many pending runs)', async () => {
      mockRunScheduleForUser.mockResolvedValueOnce({
        success: false,
        error: 'Schedule has too many pending runs (5). Wait for some to complete before triggering again.',
      });

      const req = mockReq({ params: { id: 'sched-1' } });
      const res = mockRes();

      await runSchedule(req, res);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('pending runs'),
        }),
      );
    });

    it('should return 429 when cooldown (wait before triggering again)', async () => {
      mockRunScheduleForUser.mockResolvedValueOnce({
        success: false,
        error: 'Please wait 30s before triggering this schedule again (run already in progress).',
      });

      const req = mockReq({ params: { id: 'sched-1' } });
      const res = mockRes();

      await runSchedule(req, res);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('wait'),
        }),
      );
    });

    it('should return 400 when schedule ID is invalid', async () => {
      mockRunScheduleForUser.mockResolvedValueOnce({
        success: false,
        error: 'Invalid schedule ID',
      });

      const req = mockReq({ params: { id: 'not-valid-id' } });
      const res = mockRes();

      await runSchedule(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid schedule ID' });
    });

    it('should return 404 when schedule not found', async () => {
      mockRunScheduleForUser.mockResolvedValueOnce({
        success: false,
        error: 'Schedule not found',
      });

      const req = mockReq({ params: { id: 'sched-1' } });
      const res = mockRes();

      await runSchedule(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Schedule not found' });
    });

    it('should return 500 for non-throttle errors', async () => {
      mockRunScheduleForUser.mockResolvedValueOnce({
        success: false,
        error: 'Database connection failed',
      });

      const req = mockReq({ params: { id: 'sched-1' } });
      const res = mockRes();

      await runSchedule(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Database connection failed',
        }),
      );
    });
  });

  describe('createSchedule - validation errors', () => {
    it('should return 400 when createScheduleForUser throws schedule limit error', async () => {
      mockCreateScheduleForUser.mockRejectedValueOnce(
        new Error('Schedule limit reached (max 50 per user). Delete existing schedules before creating new ones.'),
      );

      const req = mockReq({
        body: {
          name: 'Test',
          agentId: 'agent-1',
          prompt: 'Run daily',
          scheduleType: 'recurring',
          cronExpression: '0 0 * * *',
        },
      });
      const res = mockRes();

      await createSchedule(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Schedule limit reached'),
        }),
      );
    });

    it('should return 400 when createScheduleForUser throws runAt in past error', async () => {
      mockCreateScheduleForUser.mockRejectedValueOnce(new Error('runAt must be in the future'));

      const req = mockReq({
        body: {
          name: 'Test',
          agentId: 'agent-1',
          prompt: 'Run once',
          scheduleType: 'one-off',
          runAt: '2020-01-01T00:00:00Z',
        },
      });
      const res = mockRes();

      await createSchedule(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'runAt must be in the future',
        }),
      );
    });
  });

  describe('updateSchedule - validation errors', () => {
    it('should return 400 when updateScheduleForUser throws Prompt cannot be empty', async () => {
      dbModels.ScheduledPrompt.findOne.mockResolvedValue({
        _id: 'sched-1',
        userId: 'user-1',
        scheduleType: 'recurring',
        timezone: 'UTC',
        save: jest.fn(),
        toObject: () => ({}),
      });
      mockUpdateScheduleForUser.mockRejectedValueOnce(new Error('Prompt cannot be empty'));

      const req = mockReq({
        params: { id: 'sched-1' },
        body: { prompt: '' },
      });
      const res = mockRes();

      await updateSchedule(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Prompt cannot be empty',
        }),
      );
    });
  });
});
