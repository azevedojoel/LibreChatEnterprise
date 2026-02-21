/**
 * Tests for dealService - CRUD operations for CRM deals
 */
const mockDealCreate = jest.fn();
const mockDealFindOne = jest.fn();
const mockDealFindOneAndUpdate = jest.fn();
const mockDealFind = jest.fn();
const mockPipelineFindOne = jest.fn();
const mockCreateActivity = jest.fn();

jest.mock('../activityLogger', () => ({
  createActivity: (...args) => mockCreateActivity(...args),
}));

jest.mock('~/db/models', () => ({
  Deal: {
    create: jest.fn().mockImplementation((data) => {
      mockDealCreate(data);
      const doc = { _id: 'deal-1', ...data, toObject: () => ({ _id: 'deal-1', ...data }) };
      return Promise.resolve(doc);
    }),
    findOne: jest.fn().mockImplementation((query) => {
      mockDealFindOne(query);
      return {
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      };
    }),
    findOneAndUpdate: jest.fn().mockImplementation((query, update, opts) => {
      mockDealFindOneAndUpdate(query, update, opts);
      return {
        lean: jest.fn().mockResolvedValue(null),
      };
    }),
    find: jest.fn().mockImplementation((query) => {
      mockDealFind(query);
      return {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      };
    }),
  },
  Pipeline: {
    findOne: jest.fn().mockImplementation((query) => {
      mockPipelineFindOne(query);
      return {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      };
    }),
  },
}));

const dbModels = require('~/db/models');
const { createDeal, updateDeal, getDealById, listDeals } = require('../dealService');

describe('dealService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createDeal', () => {
    it('creates Deal and calls createActivity when actorId provided', async () => {
      dbModels.Deal.create.mockResolvedValueOnce({
        _id: 'deal-1',
        stage: 'quote',
        contactId: 'contact-1',
        toObject: () => ({ _id: 'deal-1', stage: 'quote' }),
      });

      await createDeal({
        projectId: 'proj-1',
        data: {
          pipelineId: 'pipeline-1',
          stage: 'quote',
          contactId: 'contact-1',
          value: 10000,
          ownerType: 'agent',
          ownerId: 'agent-1',
        },
        actorId: 'agent-1',
      });

      expect(dbModels.Deal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          pipelineId: 'pipeline-1',
          stage: 'quote',
          contactId: 'contact-1',
          value: 10000,
        }),
      );
      expect(mockCreateActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          dealId: 'deal-1',
          type: 'deal_created',
          actorId: 'agent-1',
          summary: 'Deal created in stage: quote',
        }),
      );
    });
  });

  describe('updateDeal', () => {
    it('creates stage_change Activity when stage changes and previousStage differs', async () => {
      const updatedDeal = {
        _id: 'deal-1',
        stage: 'closed',
        contactId: 'contact-1',
        projectId: 'proj-1',
      };
      dbModels.Deal.findOneAndUpdate.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue(updatedDeal),
      });

      await updateDeal({
        projectId: 'proj-1',
        dealId: 'deal-1',
        updates: { stage: 'closed' },
        previousStage: 'quote',
        actorId: 'agent-1',
      });

      expect(mockCreateActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'stage_change',
          summary: 'Deal moved from quote to closed',
          metadata: { fromStage: 'quote', toStage: 'closed' },
        }),
      );
    });

    it('creates deal_updated Activity when stage does not change', async () => {
      const updatedDeal = { _id: 'deal-1', stage: 'quote', projectId: 'proj-1' };
      dbModels.Deal.findOneAndUpdate.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue(updatedDeal),
      });

      await updateDeal({
        projectId: 'proj-1',
        dealId: 'deal-1',
        updates: { value: 15000 },
        previousStage: 'quote',
        actorId: 'agent-1',
      });

      expect(mockCreateActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'deal_updated',
          summary: 'Deal updated',
        }),
      );
    });
  });

  describe('getDealById', () => {
    it('calls Deal.findOne with _id and projectId and populates contactId and organizationId', async () => {
      dbModels.Deal.findOne.mockReturnValueOnce({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: 'deal-1', contactId: { name: 'John' } }),
      });

      await getDealById('proj-1', 'deal-1');

      expect(dbModels.Deal.findOne).toHaveBeenCalledWith({ _id: 'deal-1', projectId: 'proj-1' });
    });
  });

  describe('listDeals', () => {
    it('builds query with pipelineId, stage, contactId filters', async () => {
      await listDeals({
        projectId: 'proj-1',
        pipelineId: 'pipeline-1',
        stage: 'quote',
        contactId: 'contact-1',
        limit: 10,
        skip: 0,
      });

      expect(mockDealFind).toHaveBeenCalledWith({
        projectId: 'proj-1',
        pipelineId: 'pipeline-1',
        stage: 'quote',
        contactId: 'contact-1',
      });
    });
  });
});
