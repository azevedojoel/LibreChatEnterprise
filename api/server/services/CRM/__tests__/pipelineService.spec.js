/**
 * Tests for pipelineService - CRUD operations for CRM pipelines
 */
const mockPipelineCreate = jest.fn();
const mockPipelineFindOne = jest.fn();
const mockPipelineFindOneAndUpdate = jest.fn();
const mockPipelineFind = jest.fn();
const mockPipelineUpdateMany = jest.fn();

jest.mock('~/db/models', () => ({
  Pipeline: {
    create: jest.fn().mockImplementation((data) => {
      mockPipelineCreate(data);
      const doc = { _id: 'pipeline-1', ...data, toObject: () => ({ _id: 'pipeline-1', ...data }) };
      return Promise.resolve(doc);
    }),
    findOne: jest.fn().mockImplementation((query) => {
      mockPipelineFindOne(query);
      return {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      };
    }),
    findOneAndUpdate: jest.fn().mockImplementation((query, update, opts) => {
      mockPipelineFindOneAndUpdate(query, update, opts);
      return {
        lean: jest.fn().mockResolvedValue(null),
      };
    }),
    find: jest.fn().mockImplementation((query) => {
      mockPipelineFind(query);
      return {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      };
    }),
    updateMany: jest.fn().mockImplementation((query, update) => {
      mockPipelineUpdateMany(query, update);
      return Promise.resolve({ modifiedCount: 0 });
    }),
  },
}));

const dbModels = require('~/db/models');
const {
  createPipeline,
  updatePipeline,
  getPipelineById,
  listPipelines,
  getDefaultPipeline,
} = require('../pipelineService');

describe('pipelineService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPipeline', () => {
    it('creates pipeline with isDefault=false by default', async () => {
      dbModels.Pipeline.create.mockResolvedValueOnce({
        _id: 'pipeline-1',
        name: 'Sales',
        stages: ['lead', 'quote', 'closed'],
        isDefault: false,
        toObject: () => ({ _id: 'pipeline-1', name: 'Sales' }),
      });

      await createPipeline({
        projectId: 'proj-1',
        data: { name: 'Sales', stages: ['lead', 'quote', 'closed'] },
      });

      expect(dbModels.Pipeline.create).toHaveBeenCalledWith({
        projectId: 'proj-1',
        name: 'Sales',
        stages: ['lead', 'quote', 'closed'],
        isDefault: false,
      });
      expect(dbModels.Pipeline.updateMany).not.toHaveBeenCalled();
    });

    it('calls updateMany to reset isDefault when creating with isDefault=true', async () => {
      dbModels.Pipeline.create.mockResolvedValueOnce({
        _id: 'pipeline-2',
        name: 'Default Pipeline',
        stages: ['open', 'closed'],
        isDefault: true,
        toObject: () => ({}),
      });

      await createPipeline({
        projectId: 'proj-1',
        data: { name: 'Default Pipeline', stages: ['open', 'closed'], isDefault: true },
      });

      expect(dbModels.Pipeline.updateMany).toHaveBeenCalledWith(
        { projectId: 'proj-1' },
        { $set: { isDefault: false } },
      );
    });
  });

  describe('updatePipeline', () => {
    it('calls findOneAndUpdate with projectId and pipelineId', async () => {
      dbModels.Pipeline.findOneAndUpdate.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({ _id: 'pipeline-1', name: 'Sales Updated' }),
      });

      await updatePipeline('proj-1', 'pipeline-1', { name: 'Sales Updated' });

      expect(dbModels.Pipeline.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'pipeline-1', projectId: 'proj-1' },
        expect.objectContaining({ $set: expect.objectContaining({ name: 'Sales Updated' }) }),
        { new: true },
      );
    });

    it('resets isDefault on other pipelines when updates.isDefault is true', async () => {
      dbModels.Pipeline.findOneAndUpdate.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({ _id: 'pipeline-1', isDefault: true }),
      });

      await updatePipeline('proj-1', 'pipeline-1', { isDefault: true });

      expect(dbModels.Pipeline.updateMany).toHaveBeenCalledWith(
        { projectId: 'proj-1' },
        { $set: { isDefault: false } },
      );
    });
  });

  describe('getPipelineById', () => {
    it('calls Pipeline.findOne with _id and projectId', async () => {
      dbModels.Pipeline.findOne.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({ _id: 'pipeline-1', name: 'Sales' }),
      });

      await getPipelineById('proj-1', 'pipeline-1');

      expect(dbModels.Pipeline.findOne).toHaveBeenCalledWith({ _id: 'pipeline-1', projectId: 'proj-1' });
    });
  });

  describe('listPipelines', () => {
    it('calls Pipeline.find with projectId', async () => {
      await listPipelines('proj-1');

      expect(dbModels.Pipeline.find).toHaveBeenCalledWith({ projectId: 'proj-1' });
    });
  });

  describe('getDefaultPipeline', () => {
    it('calls findOne with isDefault true first, then with projectId and sort when no default', async () => {
      const defaultPipeline = { _id: 'pipeline-1', name: 'Default', isDefault: true };
      dbModels.Pipeline.findOne
        .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(defaultPipeline) });

      const result = await getDefaultPipeline('proj-1');

      expect(dbModels.Pipeline.findOne).toHaveBeenCalledWith({ projectId: 'proj-1', isDefault: true });
      expect(result).toEqual(defaultPipeline);
    });

    it('falls back to first by createdAt when no default pipeline', async () => {
      const firstPipeline = { _id: 'pipeline-1', name: 'First' };
      const findOneChain = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(firstPipeline),
      };
      dbModels.Pipeline.findOne
        .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) })
        .mockReturnValueOnce(findOneChain);

      const result = await getDefaultPipeline('proj-1');

      expect(dbModels.Pipeline.findOne).toHaveBeenNthCalledWith(1, { projectId: 'proj-1', isDefault: true });
      expect(dbModels.Pipeline.findOne).toHaveBeenNthCalledWith(2, { projectId: 'proj-1' });
      expect(result).toEqual(firstPipeline);
    });
  });
});
