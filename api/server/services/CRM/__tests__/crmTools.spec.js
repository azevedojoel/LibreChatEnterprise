/**
 * Tests for CRM LangChain tools (createCRMTools).
 */
const { Tools } = require('librechat-data-provider');

const mockListPipelines = jest.fn();
const mockCreateContact = jest.fn();
const mockUpdateContact = jest.fn();
const mockGetContactById = jest.fn();
const mockGetContactByEmail = jest.fn();
const mockFindContactsByName = jest.fn();
const mockListContacts = jest.fn();
const mockCreateOrganization = jest.fn();
const mockGetOrganizationByName = jest.fn();
const mockCreateDeal = jest.fn();
const mockUpdateDeal = jest.fn();
const mockGetDealById = jest.fn();
const mockListDeals = jest.fn();
const mockCreateActivity = jest.fn();
const mockListActivities = jest.fn();
const mockGetDefaultPipeline = jest.fn();

jest.mock('../index', () => ({
  listPipelines: (...args) => mockListPipelines(...args),
  createContact: (...args) => mockCreateContact(...args),
  updateContact: (...args) => mockUpdateContact(...args),
  getContactById: (...args) => mockGetContactById(...args),
  getContactByEmail: (...args) => mockGetContactByEmail(...args),
  findContactsByName: (...args) => mockFindContactsByName(...args),
  listContacts: (...args) => mockListContacts(...args),
  createOrganization: (...args) => mockCreateOrganization(...args),
  getOrganizationByName: (...args) => mockGetOrganizationByName(...args),
  createDeal: (...args) => mockCreateDeal(...args),
  updateDeal: (...args) => mockUpdateDeal(...args),
  getDealById: (...args) => mockGetDealById(...args),
  listDeals: (...args) => mockListDeals(...args),
  createActivity: (...args) => mockCreateActivity(...args),
  listActivities: (...args) => mockListActivities(...args),
  getDefaultPipeline: (...args) => mockGetDefaultPipeline(...args),
}));

const mockTouchContactLastActivity = jest.fn();
jest.mock('../activityLogger', () => ({
  touchContactLastActivity: (...args) => mockTouchContactLastActivity(...args),
}));

const { createCRMTools } = require('../crmTools');

const PROJECT_ID = 'proj-123';
const AGENT_ID = 'agent-456';

const expectedToolKeys = [
  Tools.crm_list_pipelines,
  Tools.crm_create_contact,
  Tools.crm_update_contact,
  Tools.crm_get_contact,
  Tools.crm_list_contacts,
  Tools.crm_create_organization,
  Tools.crm_create_deal,
  Tools.crm_update_deal,
  Tools.crm_list_deals,
  Tools.crm_log_activity,
  Tools.crm_list_activities,
];

describe('createCRMTools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('tool keys', () => {
    it('returns an object with all 11 tool keys', () => {
      const tools = createCRMTools({ projectId: PROJECT_ID, agentId: AGENT_ID });
      expect(Object.keys(tools)).toHaveLength(11);
      expectedToolKeys.forEach((key) => {
        expect(tools).toHaveProperty(key);
        expect(tools[key]).toBeDefined();
      });
    });
  });

  describe('project context', () => {
    it('crm_list_pipelines returns JSON error when projectId is null', async () => {
      const tools = createCRMTools({ projectId: null, agentId: AGENT_ID });
      const t = tools[Tools.crm_list_pipelines];
      const result = await t.invoke({});
      const parsed = JSON.parse(result);
      expect(parsed.error).toContain('project context');
      expect(mockListPipelines).not.toHaveBeenCalled();
    });

    it('crm_list_pipelines returns JSON error when projectId is undefined', async () => {
      const tools = createCRMTools({ projectId: undefined, agentId: AGENT_ID });
      const t = tools[Tools.crm_list_pipelines];
      const result = await t.invoke({});
      const parsed = JSON.parse(result);
      expect(parsed.error).toContain('project context');
      expect(mockListPipelines).not.toHaveBeenCalled();
    });
  });

  describe('crm_list_pipelines', () => {
    it('invokes listPipelines when projectId is valid', async () => {
      mockListPipelines.mockResolvedValue([{ _id: 'p1', name: 'Sales' }]);
      const tools = createCRMTools({ projectId: PROJECT_ID, agentId: AGENT_ID });
      const t = tools[Tools.crm_list_pipelines];
      const result = await t.invoke({});
      expect(mockListPipelines).toHaveBeenCalledWith(PROJECT_ID);
      expect(JSON.parse(result)).toEqual([{ _id: 'p1', name: 'Sales' }]);
    });
  });

  describe('crm_create_contact', () => {
    it('returns error when name is empty', async () => {
      const tools = createCRMTools({ projectId: PROJECT_ID, agentId: AGENT_ID });
      const t = tools[Tools.crm_create_contact];
      const result = await t.invoke({ name: '' });
      const parsed = JSON.parse(result);
      expect(parsed.error).toBe('name is required');
      expect(mockCreateContact).not.toHaveBeenCalled();
    });

    it('returns duplicate error when email provided and contact with that email exists', async () => {
      mockGetContactByEmail.mockResolvedValue({ _id: 'c-existing', name: 'Jane', email: 'jane@test.com' });
      const tools = createCRMTools({ projectId: PROJECT_ID, agentId: AGENT_ID });
      const t = tools[Tools.crm_create_contact];
      const result = await t.invoke({ name: 'Jane Doe', email: 'jane@test.com' });
      const parsed = JSON.parse(result);
      expect(parsed.error).toBe('Duplicate contact: A contact with this email already exists.');
      expect(parsed.existingContactId).toBe('c-existing');
      expect(parsed.suggestion).toContain('crm_get_contact');
      expect(mockCreateContact).not.toHaveBeenCalled();
    });

    it('invokes createContact with correct params when name provided', async () => {
      mockGetContactByEmail.mockResolvedValue(null);
      mockCreateContact.mockResolvedValue({ _id: 'c1', name: 'John' });
      const tools = createCRMTools({
        projectId: PROJECT_ID,
        agentId: AGENT_ID,
        conversationId: 'conv-1',
        messageId: 'msg-1',
      });
      const t = tools[Tools.crm_create_contact];
      await t.invoke({ name: 'John Doe', email: 'john@test.com' });
      expect(mockCreateContact).toHaveBeenCalledWith({
        projectId: PROJECT_ID,
        data: expect.objectContaining({
          name: 'John Doe',
          email: 'john@test.com',
          source: 'agent',
          status: 'lead',
          ownerType: 'agent',
          ownerId: AGENT_ID,
        }),
        actorId: AGENT_ID,
        actorType: 'agent',
        toolName: Tools.crm_create_contact,
        conversationId: 'conv-1',
        messageId: 'msg-1',
      });
    });
  });

  describe('crm_create_deal', () => {
    it('returns error when stage is empty', async () => {
      const tools = createCRMTools({ projectId: PROJECT_ID, agentId: AGENT_ID });
      const t = tools[Tools.crm_create_deal];
      const result = await t.invoke({ stage: '' });
      const parsed = JSON.parse(result);
      expect(parsed.error).toBe('stage is required');
      expect(mockCreateDeal).not.toHaveBeenCalled();
    });

    it('uses getDefaultPipeline when pipelineId not provided', async () => {
      mockGetDefaultPipeline.mockResolvedValue({ _id: 'pipe-1', name: 'Sales' });
      mockCreateDeal.mockResolvedValue({ _id: 'd1', stage: 'qualified' });
      const tools = createCRMTools({ projectId: PROJECT_ID, agentId: AGENT_ID });
      const t = tools[Tools.crm_create_deal];
      await t.invoke({ stage: 'qualified' });
      expect(mockGetDefaultPipeline).toHaveBeenCalledWith(PROJECT_ID);
      expect(mockCreateDeal).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pipelineId: 'pipe-1',
            stage: 'qualified',
          }),
        }),
      );
    });

    it('uses pipelineId when provided (overrides default)', async () => {
      mockGetDefaultPipeline.mockResolvedValue({ _id: 'default-pipe' });
      mockCreateDeal.mockResolvedValue({ _id: 'd1', stage: 'qualified' });
      const tools = createCRMTools({ projectId: PROJECT_ID, agentId: AGENT_ID });
      const t = tools[Tools.crm_create_deal];
      await t.invoke({ pipelineId: 'custom-pipe', stage: 'qualified' });
      expect(mockCreateDeal).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pipelineId: 'custom-pipe',
            stage: 'qualified',
          }),
        }),
      );
    });

    it('returns error when no pipeline found and pipelineId not provided', async () => {
      mockGetDefaultPipeline.mockResolvedValue(null);
      const tools = createCRMTools({ projectId: PROJECT_ID, agentId: AGENT_ID });
      const t = tools[Tools.crm_create_deal];
      const result = await t.invoke({ stage: 'qualified' });
      const parsed = JSON.parse(result);
      expect(parsed.error).toContain('No pipeline found');
      expect(mockCreateDeal).not.toHaveBeenCalled();
    });

    it('returns duplicate error when contactId provided and deal for that contact in same pipeline stage exists', async () => {
      mockGetDefaultPipeline.mockResolvedValue({ _id: 'pipe-1', name: 'Sales' });
      mockListDeals.mockResolvedValue([{ _id: 'd-existing', stage: 'qualified', contactId: 'c1' }]);
      const tools = createCRMTools({ projectId: PROJECT_ID, agentId: AGENT_ID });
      const t = tools[Tools.crm_create_deal];
      const result = await t.invoke({ stage: 'qualified', contactId: 'c1' });
      const parsed = JSON.parse(result);
      expect(parsed.error).toBe('Duplicate deal: A deal for this contact already exists in this pipeline stage.');
      expect(parsed.existingDealId).toBe('d-existing');
      expect(parsed.suggestion).toContain('crm_update_deal');
      expect(mockListDeals).toHaveBeenCalledWith({
        projectId: PROJECT_ID,
        pipelineId: 'pipe-1',
        stage: 'qualified',
        contactId: 'c1',
        limit: 1,
      });
      expect(mockCreateDeal).not.toHaveBeenCalled();
    });
  });

  describe('crm_log_activity', () => {
    it('returns error when neither contactId nor dealId provided', async () => {
      const tools = createCRMTools({ projectId: PROJECT_ID, agentId: AGENT_ID });
      const t = tools[Tools.crm_log_activity];
      const result = await t.invoke({ type: 'call_logged' });
      const parsed = JSON.parse(result);
      expect(parsed.error).toBe('contactId or dealId is required');
      expect(mockCreateActivity).not.toHaveBeenCalled();
    });

    it('invokes createActivity and touchContactLastActivity when contactId present', async () => {
      mockCreateActivity.mockResolvedValue({ _id: 'a1', type: 'call_logged' });
      mockTouchContactLastActivity.mockResolvedValue(undefined);
      const tools = createCRMTools({ projectId: PROJECT_ID, agentId: AGENT_ID });
      const t = tools[Tools.crm_log_activity];
      const result = await t.invoke({
        contactId: 'contact-123',
        type: 'call_logged',
        summary: 'Called client',
      });
      expect(mockCreateActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: PROJECT_ID,
          contactId: 'contact-123',
          type: 'call_logged',
          actorType: 'agent',
          actorId: AGENT_ID,
          summary: 'Called client',
        }),
      );
      expect(mockTouchContactLastActivity).toHaveBeenCalledWith('contact-123');
      expect(JSON.parse(result)).toEqual({ _id: 'a1', type: 'call_logged' });
    });

    it('does not call touchContactLastActivity when only dealId provided', async () => {
      mockCreateActivity.mockResolvedValue({ _id: 'a1', type: 'stage_change' });
      const tools = createCRMTools({ projectId: PROJECT_ID, agentId: AGENT_ID });
      const t = tools[Tools.crm_log_activity];
      await t.invoke({ dealId: 'deal-456', type: 'stage_change' });
      expect(mockCreateActivity).toHaveBeenCalled();
      expect(mockTouchContactLastActivity).not.toHaveBeenCalled();
    });
  });

  describe('crm_get_contact', () => {
    it('returns error when neither contactId, email, nor name provided', async () => {
      const tools = createCRMTools({ projectId: PROJECT_ID, agentId: AGENT_ID });
      const t = tools[Tools.crm_get_contact];
      const result = await t.invoke({});
      const parsed = JSON.parse(result);
      expect(parsed.error).toBe('contactId, email, or name is required');
      expect(mockGetContactById).not.toHaveBeenCalled();
      expect(mockGetContactByEmail).not.toHaveBeenCalled();
      expect(mockFindContactsByName).not.toHaveBeenCalled();
    });

    it('invokes getContactById when contactId provided', async () => {
      mockGetContactById.mockResolvedValue({ _id: 'c1', name: 'Jane' });
      const tools = createCRMTools({ projectId: PROJECT_ID, agentId: AGENT_ID });
      const t = tools[Tools.crm_get_contact];
      const result = await t.invoke({ contactId: 'c1' });
      expect(mockGetContactById).toHaveBeenCalledWith(PROJECT_ID, 'c1');
      expect(mockGetContactByEmail).not.toHaveBeenCalled();
      expect(JSON.parse(result)).toEqual({ _id: 'c1', name: 'Jane' });
    });

    it('invokes getContactByEmail when email provided', async () => {
      mockGetContactByEmail.mockResolvedValue({ _id: 'c1', email: 'jane@test.com' });
      const tools = createCRMTools({ projectId: PROJECT_ID, agentId: AGENT_ID });
      const t = tools[Tools.crm_get_contact];
      await t.invoke({ email: 'jane@test.com' });
      expect(mockGetContactByEmail).toHaveBeenCalledWith(PROJECT_ID, 'jane@test.com');
      expect(mockGetContactById).not.toHaveBeenCalled();
    });

    it('invokes findContactsByName when name provided and returns first match', async () => {
      const contact = { _id: 'c1', name: 'John Smith', email: 'john@test.com' };
      mockFindContactsByName.mockResolvedValue([contact]);
      const tools = createCRMTools({ projectId: PROJECT_ID, agentId: AGENT_ID });
      const t = tools[Tools.crm_get_contact];
      const result = await t.invoke({ name: 'John' });
      expect(mockFindContactsByName).toHaveBeenCalledWith(PROJECT_ID, 'John', 1);
      expect(mockGetContactById).not.toHaveBeenCalled();
      expect(mockGetContactByEmail).not.toHaveBeenCalled();
      expect(JSON.parse(result)).toEqual(contact);
    });

    it('returns Contact not found when name provided and no match', async () => {
      mockFindContactsByName.mockResolvedValue([]);
      const tools = createCRMTools({ projectId: PROJECT_ID, agentId: AGENT_ID });
      const t = tools[Tools.crm_get_contact];
      const result = await t.invoke({ name: 'NonExistent' });
      const parsed = JSON.parse(result);
      expect(parsed.error).toBe('Contact not found');
      expect(mockFindContactsByName).toHaveBeenCalledWith(PROJECT_ID, 'NonExistent', 1);
    });
  });

  describe('other tools invoke services', () => {
    it('crm_update_contact invokes updateContact', async () => {
      mockUpdateContact.mockResolvedValue({ _id: 'c1', name: 'Updated' });
      const tools = createCRMTools({ projectId: PROJECT_ID, agentId: AGENT_ID });
      const t = tools[Tools.crm_update_contact];
      await t.invoke({ contactId: 'c1', name: 'Updated' });
      expect(mockUpdateContact).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: PROJECT_ID,
          contactId: 'c1',
          updates: expect.objectContaining({ name: 'Updated' }),
        }),
      );
    });

    it('crm_list_contacts invokes listContacts', async () => {
      mockListContacts.mockResolvedValue([{ _id: 'c1' }]);
      const tools = createCRMTools({ projectId: PROJECT_ID, agentId: AGENT_ID });
      const t = tools[Tools.crm_list_contacts];
      await t.invoke({ noActivitySinceDays: 7 });
      expect(mockListContacts).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: PROJECT_ID,
          noActivitySinceDays: 7,
        }),
      );
    });

    it('crm_create_organization returns duplicate error when org with same name exists', async () => {
      mockGetOrganizationByName.mockResolvedValue({ _id: 'o-existing', name: 'Acme Corp' });
      const tools = createCRMTools({ projectId: PROJECT_ID, agentId: AGENT_ID });
      const t = tools[Tools.crm_create_organization];
      const result = await t.invoke({ name: 'Acme Corp' });
      const parsed = JSON.parse(result);
      expect(parsed.error).toBe('Duplicate organization: An organization with this name already exists.');
      expect(parsed.existingOrganizationId).toBe('o-existing');
      expect(parsed.suggestion).toContain('existing organization ID');
      expect(mockCreateOrganization).not.toHaveBeenCalled();
    });

    it('crm_create_organization invokes createOrganization', async () => {
      mockGetOrganizationByName.mockResolvedValue(null);
      mockCreateOrganization.mockResolvedValue({ _id: 'o1', name: 'Acme' });
      const tools = createCRMTools({ projectId: PROJECT_ID, agentId: AGENT_ID });
      const t = tools[Tools.crm_create_organization];
      await t.invoke({ name: 'Acme Corp' });
      expect(mockCreateOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: PROJECT_ID,
          data: expect.objectContaining({ name: 'Acme Corp' }),
        }),
      );
    });

    it('crm_update_deal invokes getDealById then updateDeal', async () => {
      mockGetDealById.mockResolvedValue({ _id: 'd1', stage: 'qualified' });
      mockUpdateDeal.mockResolvedValue({ _id: 'd1', stage: 'won' });
      const tools = createCRMTools({ projectId: PROJECT_ID, agentId: AGENT_ID });
      const t = tools[Tools.crm_update_deal];
      await t.invoke({ dealId: 'd1', stage: 'won' });
      expect(mockGetDealById).toHaveBeenCalledWith(PROJECT_ID, 'd1');
      expect(mockUpdateDeal).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: PROJECT_ID,
          dealId: 'd1',
          updates: expect.objectContaining({ stage: 'won' }),
          previousStage: 'qualified',
        }),
      );
    });

    it('crm_list_deals invokes listDeals', async () => {
      mockListDeals.mockResolvedValue([{ _id: 'd1' }]);
      const tools = createCRMTools({ projectId: PROJECT_ID, agentId: AGENT_ID });
      const t = tools[Tools.crm_list_deals];
      await t.invoke({ pipelineId: 'pipe-1' });
      expect(mockListDeals).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: PROJECT_ID,
          pipelineId: 'pipe-1',
        }),
      );
    });

    it('crm_list_activities invokes listActivities', async () => {
      mockListActivities.mockResolvedValue([{ _id: 'a1' }]);
      const tools = createCRMTools({ projectId: PROJECT_ID, agentId: AGENT_ID });
      const t = tools[Tools.crm_list_activities];
      await t.invoke({ contactId: 'c1' });
      expect(mockListActivities).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: PROJECT_ID,
          contactId: 'c1',
        }),
      );
    });
  });
});
