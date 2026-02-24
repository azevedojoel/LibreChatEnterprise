/**
 * Tests for organizationService - CRUD operations for CRM organizations
 */
const mockOrgCreate = jest.fn();
const mockOrgFindOne = jest.fn();
const mockOrgFindOneAndUpdate = jest.fn();
const mockOrgFind = jest.fn();

jest.mock('~/db/models', () => ({
  Organization: {
    create: jest.fn().mockImplementation((data) => {
      mockOrgCreate(data);
      const doc = { _id: 'org-1', ...data, toObject: () => ({ _id: 'org-1', ...data }) };
      return Promise.resolve(doc);
    }),
    findOne: jest.fn().mockImplementation((query) => {
      mockOrgFindOne(query);
      return {
        lean: jest.fn().mockResolvedValue(null),
      };
    }),
    findOneAndUpdate: jest.fn().mockImplementation((query, update, opts) => {
      mockOrgFindOneAndUpdate(query, update, opts);
      return {
        lean: jest.fn().mockResolvedValue(null),
      };
    }),
    find: jest.fn().mockImplementation((query) => {
      mockOrgFind(query);
      return {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      };
    }),
  },
}));

const dbModels = require('~/db/models');
const {
  createOrganization,
  updateOrganization,
  getOrganizationById,
  getOrganizationByName,
  listOrganizations,
} = require('../organizationService');

const NOT_DELETED = { $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }] };

describe('organizationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createOrganization', () => {
    it('calls Organization.create with projectId and data', async () => {
      dbModels.Organization.create.mockResolvedValueOnce({
        _id: 'org-1',
        name: 'Acme Corp',
        toObject: () => ({ _id: 'org-1', name: 'Acme Corp' }),
      });

      const result = await createOrganization({
        projectId: 'proj-1',
        data: {
          name: 'Acme Corp',
          domain: 'acme.com',
          metadata: { industry: 'tech' },
        },
      });

      expect(dbModels.Organization.create).toHaveBeenCalledWith({
        projectId: 'proj-1',
        name: 'Acme Corp',
        domain: 'acme.com',
        metadata: { industry: 'tech' },
      });
      expect(result._id).toBe('org-1');
    });
  });

  describe('updateOrganization', () => {
    it('calls findOneAndUpdate with projectId and organizationId', async () => {
      dbModels.Organization.findOneAndUpdate.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({ _id: 'org-1', name: 'Acme Updated' }),
      });

      await updateOrganization('proj-1', 'org-1', { name: 'Acme Updated', domain: 'acme.io' });

      expect(dbModels.Organization.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'org-1', projectId: 'proj-1', ...NOT_DELETED },
        expect.objectContaining({
          $set: expect.objectContaining({
            name: 'Acme Updated',
            domain: 'acme.io',
          }),
        }),
        { new: true },
      );
    });
  });

  describe('getOrganizationById', () => {
    it('calls Organization.findOne with _id and projectId', async () => {
      dbModels.Organization.findOne.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({ _id: 'org-1', name: 'Acme' }),
      });

      await getOrganizationById('proj-1', 'org-1');

      expect(dbModels.Organization.findOne).toHaveBeenCalledWith({ _id: 'org-1', projectId: 'proj-1', ...NOT_DELETED });
    });
  });

  describe('getOrganizationByName', () => {
    it('calls Organization.findOne with regex for exact case-insensitive name match', async () => {
      dbModels.Organization.findOne.mockImplementationOnce((query) => {
        mockOrgFindOne(query);
        return {
          lean: jest.fn().mockResolvedValue({ _id: 'org-1', name: 'Acme Corp' }),
        };
      });

      const result = await getOrganizationByName('proj-1', 'Acme Corp');

      expect(mockOrgFindOne).toHaveBeenCalledWith({
        projectId: 'proj-1',
        name: { $regex: '^Acme Corp$', $options: 'i' },
        ...NOT_DELETED,
      });
      expect(result).toEqual({ _id: 'org-1', name: 'Acme Corp' });
    });

    it('returns null when name is empty or invalid', async () => {
      expect(await getOrganizationByName('proj-1', '')).toBeNull();
      expect(await getOrganizationByName('proj-1', '   ')).toBeNull();
      expect(await getOrganizationByName('proj-1', null)).toBeNull();
      expect(mockOrgFindOne).not.toHaveBeenCalled();
    });

    it('escapes regex special chars in name', async () => {
      dbModels.Organization.findOne.mockImplementationOnce((query) => {
        mockOrgFindOne(query);
        return { lean: jest.fn().mockResolvedValue(null) };
      });

      await getOrganizationByName('proj-1', 'Acme.[x]');

      expect(mockOrgFindOne).toHaveBeenCalledWith({
        projectId: 'proj-1',
        name: { $regex: '^Acme\\.\\[x\\]$', $options: 'i' },
        ...NOT_DELETED,
      });
    });
  });

  describe('listOrganizations', () => {
    it('calls Organization.find with projectId and applies sort/skip/limit', async () => {
      await listOrganizations('proj-1', { limit: 20, skip: 5 });

      expect(dbModels.Organization.find).toHaveBeenCalledWith({ projectId: 'proj-1', ...NOT_DELETED });
    });
  });
});
