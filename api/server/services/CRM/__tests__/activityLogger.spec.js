/**
 * Tests for activityLogger - createActivity and touchContactLastActivity
 */
const mockActivityCreate = jest.fn();
const mockContactUpdateOne = jest.fn();

jest.mock('~/db/models', () => ({
  Activity: {
    create: jest.fn().mockImplementation((data) => {
      mockActivityCreate(data);
      return Promise.resolve({ _id: 'activity-1', ...data });
    }),
  },
  Contact: {
    updateOne: jest.fn().mockImplementation((filter, update) => {
      mockContactUpdateOne(filter, update);
      return Promise.resolve({ modifiedCount: 1 });
    }),
  },
}));

const { createActivity, touchContactLastActivity } = require('../activityLogger');

describe('activityLogger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createActivity', () => {
    it('creates an Activity document via Activity.create with correct params', async () => {
      const params = {
        projectId: 'proj-1',
        contactId: 'contact-1',
        dealId: 'deal-1',
        type: 'contact_created',
        actorType: 'agent',
        actorId: 'agent-1',
        conversationId: 'conv-1',
        messageId: 'msg-1',
        toolName: 'crm_create_contact',
        summary: 'Contact created: John',
        metadata: { foo: 'bar' },
      };

      const result = await createActivity(params);

      expect(mockActivityCreate).toHaveBeenCalledTimes(1);
      expect(mockActivityCreate).toHaveBeenCalledWith({
        projectId: params.projectId,
        contactId: params.contactId,
        dealId: params.dealId,
        type: params.type,
        actorType: params.actorType,
        actorId: params.actorId,
        conversationId: params.conversationId,
        messageId: params.messageId,
        toolName: params.toolName,
        summary: params.summary,
        metadata: params.metadata,
      });
      expect(result._id).toBe('activity-1');
    });

    it('handles minimal params with optional fields omitted', async () => {
      const params = {
        projectId: 'proj-2',
        type: 'agent_action',
        actorType: 'user',
        actorId: 'user-1',
      };

      await createActivity(params);

      expect(mockActivityCreate).toHaveBeenCalledWith({
        projectId: 'proj-2',
        contactId: undefined,
        dealId: undefined,
        type: 'agent_action',
        actorType: 'user',
        actorId: 'user-1',
        conversationId: undefined,
        messageId: undefined,
        toolName: undefined,
        summary: undefined,
        metadata: undefined,
      });
    });

    it('throws when Activity model is not found', async () => {
      const dbModels = require('~/db/models');
      const originalActivity = dbModels.Activity;
      dbModels.Activity = null;

      await expect(
        createActivity({
          projectId: 'proj-1',
          type: 'agent_action',
          actorType: 'agent',
          actorId: 'agent-1',
        }),
      ).rejects.toThrow('Activity model not found');

      dbModels.Activity = originalActivity;
    });
  });

  describe('touchContactLastActivity', () => {
    it('calls Contact.updateOne with contactId and lastActivityAt', async () => {
      const contactId = 'contact-123';

      await touchContactLastActivity(contactId);

      expect(mockContactUpdateOne).toHaveBeenCalledTimes(1);
      expect(mockContactUpdateOne).toHaveBeenCalledWith(
        { _id: contactId },
        expect.objectContaining({
          lastActivityAt: expect.any(Date),
        }),
      );
    });

    it('does nothing when Contact model is not found', async () => {
      const dbModels = require('~/db/models');
      const originalContact = dbModels.Contact;
      dbModels.Contact = null;

      await touchContactLastActivity('contact-1');

      expect(mockContactUpdateOne).not.toHaveBeenCalled();

      dbModels.Contact = originalContact;
    });
  });
});
