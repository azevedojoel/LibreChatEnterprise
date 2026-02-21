/**
 * Tests for activityService - Read operations for CRM activity/timeline
 */
const mockActivityFind = jest.fn();
const mockActivityFindOne = jest.fn();

jest.mock('~/db/models', () => ({
  Activity: {
    find: jest.fn().mockImplementation((query) => {
      mockActivityFind(query);
      return {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      };
    }),
    findOne: jest.fn().mockImplementation((query) => {
      mockActivityFindOne(query);
      return {
        lean: jest.fn().mockResolvedValue(null),
      };
    }),
  },
}));

const dbModels = require('~/db/models');
const { listActivities, getActivityById } = require('../activityService');

describe('activityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listActivities', () => {
    it('filters by projectId only when no contactId or dealId', async () => {
      await listActivities({ projectId: 'proj-1' });

      expect(dbModels.Activity.find).toHaveBeenCalledWith({ projectId: 'proj-1' });
    });

    it('filters by projectId, contactId, and dealId when provided', async () => {
      await listActivities({
        projectId: 'proj-1',
        contactId: 'contact-1',
        dealId: 'deal-1',
        limit: 20,
        skip: 5,
      });

      expect(dbModels.Activity.find).toHaveBeenCalledWith({
        projectId: 'proj-1',
        contactId: 'contact-1',
        dealId: 'deal-1',
      });
    });
  });

  describe('getActivityById', () => {
    it('calls Activity.findOne with _id and projectId', async () => {
      dbModels.Activity.findOne.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({ _id: 'activity-1', type: 'contact_created' }),
      });

      await getActivityById('proj-1', 'activity-1');

      expect(dbModels.Activity.findOne).toHaveBeenCalledWith({ _id: 'activity-1', projectId: 'proj-1' });
    });
  });
});
