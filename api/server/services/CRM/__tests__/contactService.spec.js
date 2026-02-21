/**
 * Tests for contactService - CRUD operations for CRM contacts
 */
const mockContactCreate = jest.fn();
const mockContactFindOne = jest.fn();
const mockContactFindOneAndUpdate = jest.fn();
const mockContactFind = jest.fn();
const mockCreateActivity = jest.fn();
const mockTouchContactLastActivity = jest.fn();

jest.mock('../activityLogger', () => ({
  createActivity: (...args) => mockCreateActivity(...args),
  touchContactLastActivity: (...args) => mockTouchContactLastActivity(...args),
}));

jest.mock('~/db/models', () => ({
  Contact: {
    create: jest.fn().mockImplementation((data) => {
      mockContactCreate(data);
      const doc = { _id: 'contact-1', ...data, toObject: () => ({ _id: 'contact-1', ...data }) };
      return Promise.resolve(doc);
    }),
    findOne: jest.fn().mockImplementation((query) => {
      mockContactFindOne(query);
      return {
        lean: jest.fn().mockResolvedValue(null),
      };
    }),
    findOneAndUpdate: jest.fn().mockImplementation((query, update, opts) => {
      mockContactFindOneAndUpdate(query, update, opts);
      return {
        lean: jest.fn().mockResolvedValue(null),
      };
    }),
    find: jest.fn().mockImplementation((query) => {
      mockContactFind(query);
      return {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      };
    }),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  },
}));

const dbModels = require('~/db/models');
const {
  createContact,
  updateContact,
  getContactById,
  getContactByEmail,
  findContactsByName,
  listContacts,
} = require('../contactService');

describe('contactService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createContact', () => {
    it('calls Contact.create with correct data', async () => {
      dbModels.Contact.create.mockResolvedValueOnce({
        _id: 'contact-1',
        name: 'John Doe',
        toObject: () => ({ _id: 'contact-1', name: 'John Doe' }),
      });

      const result = await createContact({
        projectId: 'proj-1',
        data: {
          name: 'John Doe',
          email: 'john@example.com',
          phone: '+1234567890',
          tags: ['lead'],
          source: 'agent',
          status: 'lead',
          ownerType: 'agent',
          ownerId: 'agent-1',
        },
      });

      expect(dbModels.Contact.create).toHaveBeenCalledWith({
        projectId: 'proj-1',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+1234567890',
        tags: ['lead'],
        source: 'agent',
        status: 'lead',
        ownerType: 'agent',
        ownerId: 'agent-1',
        organizationId: undefined,
      });
      expect(result._id).toBe('contact-1');
    });

    it('calls createActivity and touchContactLastActivity when actorId provided', async () => {
      const contactDoc = {
        _id: 'contact-2',
        name: 'Jane',
        toObject: () => ({ _id: 'contact-2', name: 'Jane' }),
      };
      dbModels.Contact.create.mockResolvedValueOnce(contactDoc);

      await createContact({
        projectId: 'proj-1',
        data: { name: 'Jane', ownerType: 'agent', ownerId: 'agent-1' },
        actorId: 'agent-1',
        actorType: 'agent',
        toolName: 'crm_create_contact',
      });

      expect(mockCreateActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          contactId: 'contact-2',
          type: 'contact_created',
          actorType: 'agent',
          actorId: 'agent-1',
          toolName: 'crm_create_contact',
          summary: 'Contact created: Jane',
        }),
      );
      expect(mockTouchContactLastActivity).toHaveBeenCalledWith('contact-2');
    });

    it('does not call createActivity when actorId is omitted', async () => {
      dbModels.Contact.create.mockResolvedValueOnce({
        _id: 'contact-3',
        name: 'Bob',
        toObject: () => ({ _id: 'contact-3', name: 'Bob' }),
      });

      await createContact({
        projectId: 'proj-1',
        data: { name: 'Bob', ownerType: 'user', ownerId: 'user-1' },
      });

      expect(mockCreateActivity).not.toHaveBeenCalled();
      expect(mockTouchContactLastActivity).not.toHaveBeenCalled();
    });
  });

  describe('updateContact', () => {
    it('uses findOneAndUpdate with projectId and contactId', async () => {
      const updatedContact = { _id: 'contact-1', name: 'John Updated', projectId: 'proj-1' };
      dbModels.Contact.findOneAndUpdate.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue(updatedContact),
      });

      await updateContact({
        projectId: 'proj-1',
        contactId: 'contact-1',
        updates: { name: 'John Updated' },
      });

      expect(dbModels.Contact.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'contact-1', projectId: 'proj-1' },
        expect.objectContaining({ $set: expect.objectContaining({ name: 'John Updated' }) }),
        { new: true },
      );
    });

    it('calls createActivity when actorId provided and contact found', async () => {
      const updatedContact = { _id: 'contact-1', name: 'John', projectId: 'proj-1' };
      dbModels.Contact.findOneAndUpdate.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue(updatedContact),
      });

      await updateContact({
        projectId: 'proj-1',
        contactId: 'contact-1',
        updates: { status: 'customer' },
        actorId: 'agent-1',
      });

      expect(mockCreateActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'contact_updated',
          actorId: 'agent-1',
          metadata: { updatedFields: ['status'] },
        }),
      );
    });
  });

  describe('getContactById', () => {
    it('calls Contact.findOne with _id and projectId', async () => {
      dbModels.Contact.findOne.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({ _id: 'contact-1', name: 'John' }),
      });

      await getContactById('proj-1', 'contact-1');

      expect(dbModels.Contact.findOne).toHaveBeenCalledWith({ _id: 'contact-1', projectId: 'proj-1' });
    });
  });

  describe('getContactByEmail', () => {
    it('calls Contact.findOne with projectId and email', async () => {
      dbModels.Contact.findOne.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({ _id: 'contact-1', email: 'john@example.com' }),
      });

      await getContactByEmail('proj-1', 'john@example.com');

      expect(dbModels.Contact.findOne).toHaveBeenCalledWith({
        projectId: 'proj-1',
        email: 'john@example.com',
      });
    });
  });

  describe('findContactsByName', () => {
    const makeFindChain = (leanResult) => ({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(leanResult),
    });

    it('calls Contact.find with regex query for name', async () => {
      dbModels.Contact.find.mockImplementationOnce((query) => {
        mockContactFind(query);
        return makeFindChain([{ _id: 'contact-1', name: 'John Smith' }]);
      });

      await findContactsByName('proj-1', 'John', 10);

      expect(mockContactFind).toHaveBeenCalledWith({
        projectId: 'proj-1',
        name: { $regex: 'John', $options: 'i' },
      });
    });

    it('respects limit parameter', async () => {
      const limitFn = jest.fn().mockReturnThis();
      dbModels.Contact.find.mockImplementationOnce((query) => {
        mockContactFind(query);
        return {
          sort: jest.fn().mockReturnThis(),
          limit: limitFn,
          lean: jest.fn().mockResolvedValue([]),
        };
      });

      await findContactsByName('proj-1', 'Jane', 5);

      expect(limitFn).toHaveBeenCalledWith(5);
    });

    it('returns lean results', async () => {
      const leanResult = [{ _id: 'c1', name: 'Alice' }];
      dbModels.Contact.find.mockImplementationOnce((query) => {
        mockContactFind(query);
        return makeFindChain(leanResult);
      });

      const result = await findContactsByName('proj-1', 'Alice');
      expect(result).toEqual(leanResult);
    });

    it('returns [] when name is empty or invalid', async () => {
      expect(await findContactsByName('proj-1', '')).toEqual([]);
      expect(await findContactsByName('proj-1', '   ')).toEqual([]);
      expect(await findContactsByName('proj-1', null)).toEqual([]);
      expect(mockContactFind).not.toHaveBeenCalled();
    });

    it('escapes regex special chars in name', async () => {
      dbModels.Contact.find.mockImplementationOnce((query) => {
        mockContactFind(query);
        return makeFindChain([]);
      });

      await findContactsByName('proj-1', 'John.[x]', 10);

      expect(mockContactFind).toHaveBeenCalledWith({
        projectId: 'proj-1',
        name: { $regex: 'John\\.\\[x\\]', $options: 'i' },
      });
    });
  });

  describe('listContacts', () => {
    it('builds query for status and tags', async () => {
      await listContacts({
        projectId: 'proj-1',
        status: 'lead',
        tags: ['hot'],
        limit: 10,
        skip: 0,
      });

      expect(mockContactFind).toHaveBeenCalledWith({
        projectId: 'proj-1',
        status: 'lead',
        tags: { $in: ['hot'] },
      });
    });

    it('adds $and with $or for noActivitySinceDays', async () => {
      await listContacts({
        projectId: 'proj-1',
        noActivitySinceDays: 7,
      });

      expect(mockContactFind).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          $and: [
            expect.objectContaining({
              $or: [
                { lastActivityAt: expect.objectContaining({ $lt: expect.any(Date) }) },
                { lastActivityAt: expect.objectContaining({ $exists: false }) },
                { lastActivityAt: null },
              ],
            }),
          ],
        }),
      );
    });
  });
});
