/**
 * Tests for schedulingService - listSchedulesForUser and listRunsForUser with promptGroupId filter
 */
const mockScheduledPromptFind = jest.fn();
const mockScheduledRunFind = jest.fn();

jest.mock('~/models/Conversation', () => ({
  getConvo: jest.fn().mockResolvedValue(null),
}));

jest.mock('~/models/Message', () => ({
  getMessages: jest.fn().mockResolvedValue([]),
}));

jest.mock('~/db/models', () => ({
  ScheduledPrompt: {
    find: jest.fn().mockImplementation((query) => {
      mockScheduledPromptFind(query);
      return {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
        distinct: jest.fn().mockResolvedValue([]),
      };
    }),
  },
  ScheduledRun: {
    find: jest.fn().mockImplementation((query) => {
      mockScheduledRunFind(query);
      return {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      };
    }),
  },
}));

const dbModels = require('~/db/models');
const { listSchedulesForUser, listRunsForUser, runScheduleForUser } = require('../schedulingService');

describe('schedulingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockScheduledPromptFind.mockClear();
    mockScheduledRunFind.mockClear();
  });

  describe('listSchedulesForUser', () => {
    it('should call ScheduledPrompt.find with { userId, promptGroupId } when promptGroupId provided', async () => {
      dbModels.ScheduledPrompt.find.mockImplementationOnce((query) => {
        mockScheduledPromptFind(query);
        return {
          populate: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        };
      });

      await listSchedulesForUser('user-1', { promptGroupId: 'pg-1' });

      expect(mockScheduledPromptFind).toHaveBeenCalledWith({
        userId: 'user-1',
        promptGroupId: 'pg-1',
      });
    });

    it('should call ScheduledPrompt.find with { userId } only when no promptGroupId', async () => {
      dbModels.ScheduledPrompt.find.mockImplementationOnce((query) => {
        mockScheduledPromptFind(query);
        return {
          populate: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        };
      });

      await listSchedulesForUser('user-1', {});

      expect(mockScheduledPromptFind).toHaveBeenCalledWith({ userId: 'user-1' });
    });
  });

  describe('listRunsForUser', () => {
    it('when promptGroupId provided: should call ScheduledPrompt.find for scheduleIds then ScheduledRun.find with scheduleId $in', async () => {
      const scheduleIds = ['sched-1', 'sched-2'];

      dbModels.ScheduledPrompt.find.mockImplementationOnce((query) => {
        mockScheduledPromptFind(query);
        return {
          distinct: jest.fn().mockResolvedValue(scheduleIds),
        };
      });

      dbModels.ScheduledRun.find.mockImplementationOnce((query) => {
        mockScheduledRunFind(query);
        return {
          populate: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        };
      });

      await listRunsForUser('user-1', { limit: 10, promptGroupId: 'pg-1' });

      expect(mockScheduledPromptFind).toHaveBeenCalledWith({
        userId: 'user-1',
        promptGroupId: 'pg-1',
      });
      expect(mockScheduledRunFind).toHaveBeenCalledWith({
        userId: 'user-1',
        scheduleId: { $in: scheduleIds },
      });
    });

    it('when no promptGroupId: should call ScheduledRun.find with { userId } only', async () => {
      dbModels.ScheduledRun.find.mockImplementationOnce((query) => {
        mockScheduledRunFind(query);
        return {
          populate: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        };
      });

      await listRunsForUser('user-1', { limit: 5 });

      expect(mockScheduledRunFind).toHaveBeenCalledWith({ userId: 'user-1' });
      expect(mockScheduledPromptFind).not.toHaveBeenCalled();
    });
  });

  describe('runScheduleForUser', () => {
    it('should return Invalid schedule ID when scheduleId is empty', async () => {
      const result = await runScheduleForUser('user-1', '');
      expect(result).toEqual({ success: false, error: 'Invalid schedule ID' });
    });

    it('should return Invalid schedule ID when scheduleId is not a valid ObjectId', async () => {
      const result = await runScheduleForUser('user-1', 'not-valid-id');
      expect(result).toEqual({ success: false, error: 'Invalid schedule ID' });
    });
  });
});
