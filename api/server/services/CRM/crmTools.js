/**
 * LangChain tools for the native CRM.
 * Used when an agent has the manage_crm capability.
 */
const { tool } = require('@langchain/core/tools');
const { Tools } = require('librechat-data-provider');
const {
  createContact,
  updateContact,
  getContactById,
  getContactByEmail,
  findContactsByName,
  listContacts,
  createOrganization,
  getOrganizationByName,
  createDeal,
  updateDeal,
  getDealById,
  listDeals,
  createActivity,
  listActivities,
  listPipelines,
  getDefaultPipeline,
} = require('./index');

/**
 * @param {Object} params
 * @param {string} params.projectId - Project ID (ObjectId string) for multi-tenancy
 * @param {string} params.userId - User ID (for ownerType: user)
 * @param {string} params.agentId - Current agent ID (for ownerType: agent and activity actor)
 * @param {string} [params.conversationId]
 * @param {string} [params.messageId]
 * @returns {Record<string, import('@langchain/core/tools').StructuredTool>}
 */
function createCRMTools({ projectId, userId, agentId, conversationId, messageId }) {
  const toJson = (obj) => (typeof obj === 'string' ? obj : JSON.stringify(obj ?? null));

  const requireProject = () => {
    if (!projectId) {
      return {
        error:
          'CRM tools require a project context. Assign this agent to a project, or ensure projectId is passed in the conversation context.',
      };
    }
    return null;
  };

  const listPipelinesTool = tool(
    async () => {
      const err = requireProject();
      if (err) return toJson(err);
      try {
        const pipelines = await listPipelines(projectId);
        return toJson(pipelines);
      } catch (e) {
        return toJson({ error: e.message || 'Failed to list pipelines' });
      }
    },
    {
      name: Tools.crm_list_pipelines,
      description: 'List all CRM pipelines for the current project. Returns id, name, stages, isDefault.',
      schema: { type: 'object', properties: {}, required: [] },
    },
  );

  const createContactTool = tool(
    async (rawInput) => {
      const err = requireProject();
      if (err) return toJson(err);
      const { name, email, phone, tags, source, status, organizationId } = rawInput;
      if (!name) return toJson({ error: 'name is required' });
      if (email) {
        const existing = await getContactByEmail(projectId, email);
        if (existing)
          return toJson({
            error: 'Duplicate contact: A contact with this email already exists.',
            existingContactId: existing._id?.toString?.() || existing._id,
            suggestion: 'Use crm_get_contact to retrieve it or crm_update_contact to update.',
          });
      }
      try {
        const contact = await createContact({
          projectId,
          data: {
            name,
            email,
            phone,
            tags: tags || [],
            source: source || 'agent',
            status: status || 'lead',
            ownerType: 'agent',
            ownerId: agentId,
            organizationId,
          },
          actorId: agentId,
          actorType: 'agent',
          toolName: Tools.crm_create_contact,
          conversationId,
          messageId,
        });
        return toJson(contact);
      } catch (e) {
        return toJson({ error: e.message || 'Failed to create contact' });
      }
    },
    {
      name: Tools.crm_create_contact,
      description:
        'Create a new CRM contact. Required: name. Optional: email, phone, tags, source, status (lead|prospect|customer), organizationId.',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Contact name' },
          email: { type: 'string', description: 'Contact email' },
          phone: { type: 'string', description: 'Contact phone' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
          source: { type: 'string', description: 'Source e.g. inbound_email, manual, agent' },
          status: { type: 'string', enum: ['lead', 'prospect', 'customer'], description: 'Contact status' },
          organizationId: { type: 'string', description: 'Organization ID' },
        },
        required: ['name'],
      },
    },
  );

  const updateContactTool = tool(
    async (rawInput) => {
      const err = requireProject();
      if (err) return toJson(err);
      const { contactId, name, email, phone, tags, source, status, organizationId } = rawInput;
      if (!contactId) return toJson({ error: 'contactId is required' });
      try {
        const contact = await updateContact({
          projectId,
          contactId,
          updates: { name, email, phone, tags, source, status, organizationId },
          actorId: agentId,
          actorType: 'agent',
          toolName: Tools.crm_update_contact,
          conversationId,
          messageId,
        });
        if (!contact) return toJson({ error: 'Contact not found' });
        return toJson(contact);
      } catch (e) {
        return toJson({ error: e.message || 'Failed to update contact' });
      }
    },
    {
      name: Tools.crm_update_contact,
      description:
        'Update an existing contact. Required: contactId. Optional: name, email, phone, tags, source, status, organizationId.',
      schema: {
        type: 'object',
        properties: {
          contactId: { type: 'string', description: 'Contact ID' },
          name: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          source: { type: 'string' },
          status: { type: 'string', enum: ['lead', 'prospect', 'customer'] },
          organizationId: { type: 'string' },
        },
        required: ['contactId'],
      },
    },
  );

  const getContactTool = tool(
    async (rawInput) => {
      const err = requireProject();
      if (err) return toJson(err);
      const { contactId, email, name } = rawInput;
      if (!contactId && !email && !name)
        return toJson({ error: 'contactId, email, or name is required' });
      try {
        let contact;
        if (contactId) {
          contact = await getContactById(projectId, contactId);
        } else if (email) {
          contact = await getContactByEmail(projectId, email);
        } else {
          const matches = await findContactsByName(projectId, name, 1);
          contact = matches[0] ?? null;
        }
        if (!contact) return toJson({ error: 'Contact not found' });
        return toJson(contact);
      } catch (e) {
        return toJson({ error: e.message || 'Failed to get contact' });
      }
    },
    {
      name: Tools.crm_get_contact,
      description:
        'Get a contact by ID, email, or name (fuzzy). Provide contactId, email, OR name.',
      schema: {
        type: 'object',
        properties: {
          contactId: { type: 'string', description: 'Contact ID' },
          email: { type: 'string', description: 'Contact email' },
          name: { type: 'string', description: 'Contact name for fuzzy lookup' },
        },
        required: [],
      },
    },
  );

  const listContactsTool = tool(
    async (rawInput) => {
      const err = requireProject();
      if (err) return toJson(err);
      const { status, tags, noActivitySinceDays, limit, skip } = rawInput;
      try {
        const contacts = await listContacts({
          projectId,
          status,
          tags,
          noActivitySinceDays,
          limit: limit ?? 50,
          skip: skip ?? 0,
        });
        return toJson(contacts);
      } catch (e) {
        return toJson({ error: e.message || 'Failed to list contacts' });
      }
    },
    {
      name: Tools.crm_list_contacts,
      description:
        'List contacts with optional filters. Use noActivitySinceDays to find leads with no follow-up (e.g. 3 for 3 days). Optional: status (lead|prospect|customer), tags, noActivitySinceDays, limit, skip.',
      schema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['lead', 'prospect', 'customer'] },
          tags: { type: 'array', items: { type: 'string' } },
          noActivitySinceDays: { type: 'number', description: 'Contacts with no activity in last N days' },
          limit: { type: 'number' },
          skip: { type: 'number' },
        },
        required: [],
      },
    },
  );

  const createOrganizationTool = tool(
    async (rawInput) => {
      const err = requireProject();
      if (err) return toJson(err);
      const { name, domain, metadata } = rawInput;
      if (!name) return toJson({ error: 'name is required' });
      const existingOrg = await getOrganizationByName(projectId, name);
      if (existingOrg)
        return toJson({
          error: 'Duplicate organization: An organization with this name already exists.',
          existingOrganizationId: existingOrg._id?.toString?.() || existingOrg._id,
          suggestion:
            'Use the existing organization ID for related contacts/deals, or list organizations to find it.',
        });
      try {
        const org = await createOrganization({
          projectId,
          data: { name, domain, metadata },
        });
        return toJson(org);
      } catch (e) {
        return toJson({ error: e.message || 'Failed to create organization' });
      }
    },
    {
      name: Tools.crm_create_organization,
      description: 'Create an organization (company). Required: name. Optional: domain, metadata.',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Organization name' },
          domain: { type: 'string', description: 'Company domain' },
          metadata: { type: 'object', description: 'Additional metadata' },
        },
        required: ['name'],
      },
    },
  );

  const createDealTool = tool(
    async (rawInput) => {
      const err = requireProject();
      if (err) return toJson(err);
      const { pipelineId, stage, contactId, organizationId, value, expectedCloseDate } = rawInput;
      if (!stage) return toJson({ error: 'stage is required' });
      try {
        const defaultPipeline = await getDefaultPipeline(projectId);
        const effectivePipelineId =
          pipelineId || (defaultPipeline?._id ? defaultPipeline._id.toString() : null);
        if (!effectivePipelineId)
          return toJson({
            error: 'No pipeline found. Create a pipeline first via the CRM API or crm_list_pipelines.',
          });
        if (contactId) {
          const existingDeals = await listDeals({
            projectId,
            pipelineId: effectivePipelineId,
            stage,
            contactId,
            limit: 1,
          });
          if (existingDeals?.length > 0) {
            const existing = existingDeals[0];
            return toJson({
              error: 'Duplicate deal: A deal for this contact already exists in this pipeline stage.',
              existingDealId: existing._id?.toString?.() || existing._id,
              suggestion: 'Use crm_get_contact or crm_list_deals to find it, or crm_update_deal to update.',
            });
          }
        }
        const deal = await createDeal({
          projectId,
          data: {
            pipelineId: effectivePipelineId,
            stage,
            contactId,
            organizationId,
            value,
            expectedCloseDate,
            ownerType: 'agent',
            ownerId: agentId,
          },
          actorId: agentId,
          actorType: 'agent',
          toolName: Tools.crm_create_deal,
          conversationId,
          messageId,
        });
        return toJson(deal);
      } catch (e) {
        return toJson({ error: e.message || 'Failed to create deal' });
      }
    },
    {
      name: Tools.crm_create_deal,
      description:
        'Create a deal. Required: pipelineId (or use default), stage. Optional: contactId, organizationId, value, expectedCloseDate (ISO).',
      schema: {
        type: 'object',
        properties: {
          pipelineId: { type: 'string', description: 'Pipeline ID' },
          stage: { type: 'string', description: 'Stage name from pipeline' },
          contactId: { type: 'string' },
          organizationId: { type: 'string' },
          value: { type: 'number', description: 'Deal value' },
          expectedCloseDate: { type: 'string', description: 'ISO date' },
        },
        required: ['stage'],
      },
    },
  );

  const updateDealTool = tool(
    async (rawInput) => {
      const err = requireProject();
      if (err) return toJson(err);
      const { dealId, stage, contactId, organizationId, value, expectedCloseDate } = rawInput;
      if (!dealId) return toJson({ error: 'dealId is required' });
      try {
        const existing = await getDealById(projectId, dealId);
        if (!existing) return toJson({ error: 'Deal not found' });
        const deal = await updateDeal({
          projectId,
          dealId,
          updates: { stage, contactId, organizationId, value, expectedCloseDate },
          previousStage: existing.stage,
          actorId: agentId,
          actorType: 'agent',
          toolName: Tools.crm_update_deal,
          conversationId,
          messageId,
        });
        return toJson(deal);
      } catch (e) {
        return toJson({ error: e.message || 'Failed to update deal' });
      }
    },
    {
      name: Tools.crm_update_deal,
      description: 'Update a deal. Required: dealId. Optional: stage, contactId, organizationId, value, expectedCloseDate.',
      schema: {
        type: 'object',
        properties: {
          dealId: { type: 'string', description: 'Deal ID' },
          stage: { type: 'string' },
          contactId: { type: 'string' },
          organizationId: { type: 'string' },
          value: { type: 'number' },
          expectedCloseDate: { type: 'string' },
        },
        required: ['dealId'],
      },
    },
  );

  const listDealsTool = tool(
    async (rawInput) => {
      const err = requireProject();
      if (err) return toJson(err);
      const { pipelineId, stage, contactId, limit, skip } = rawInput;
      try {
        const deals = await listDeals({
          projectId,
          pipelineId,
          stage,
          contactId,
          limit: limit ?? 50,
          skip: skip ?? 0,
        });
        return toJson(deals);
      } catch (e) {
        return toJson({ error: e.message || 'Failed to list deals' });
      }
    },
    {
      name: Tools.crm_list_deals,
      description: 'List deals. Optional: pipelineId, stage, contactId, limit, skip.',
      schema: {
        type: 'object',
        properties: {
          pipelineId: { type: 'string' },
          stage: { type: 'string' },
          contactId: { type: 'string' },
          limit: { type: 'number' },
          skip: { type: 'number' },
        },
        required: [],
      },
    },
  );

  const logActivityTool = tool(
    async (rawInput) => {
      const err = requireProject();
      if (err) return toJson(err);
      const { contactId, dealId, type, summary, metadata } = rawInput;
      if (!type) return toJson({ error: 'type is required' });
      if (!contactId && !dealId) return toJson({ error: 'contactId or dealId is required' });
      try {
        const activity = await createActivity({
          projectId,
          contactId,
          dealId,
          type: type || 'agent_action',
          actorType: 'agent',
          actorId: agentId,
          conversationId,
          messageId,
          toolName: Tools.crm_log_activity,
          summary,
          metadata,
        });
        const { touchContactLastActivity } = require('./activityLogger');
        if (contactId) await touchContactLastActivity(contactId);
        return toJson(activity);
      } catch (e) {
        return toJson({ error: e.message || 'Failed to log activity' });
      }
    },
    {
      name: Tools.crm_log_activity,
      description:
        'Log an activity (e.g. call_logged, email_sent). Required: type, contactId or dealId. Optional: summary, metadata. Types: email_sent, email_received, call_logged, agent_action, doc_matched, stage_change.',
      schema: {
        type: 'object',
        properties: {
          contactId: { type: 'string' },
          dealId: { type: 'string' },
          type: {
            type: 'string',
            enum: ['email_sent', 'email_received', 'call_logged', 'agent_action', 'doc_matched', 'stage_change'],
          },
          summary: { type: 'string' },
          metadata: { type: 'object' },
        },
        required: ['type'],
      },
    },
  );

  const listActivitiesTool = tool(
    async (rawInput) => {
      const err = requireProject();
      if (err) return toJson(err);
      const { contactId, dealId, limit, skip } = rawInput;
      try {
        const activities = await listActivities({
          projectId,
          contactId,
          dealId,
          limit: limit ?? 50,
          skip: skip ?? 0,
        });
        return toJson(activities);
      } catch (e) {
        return toJson({ error: e.message || 'Failed to list activities' });
      }
    },
    {
      name: Tools.crm_list_activities,
      description: 'List activities for a contact or deal. Provide contactId OR dealId. Optional: limit, skip.',
      schema: {
        type: 'object',
        properties: {
          contactId: { type: 'string' },
          dealId: { type: 'string' },
          limit: { type: 'number' },
          skip: { type: 'number' },
        },
        required: [],
      },
    },
  );

  return {
    [Tools.crm_list_pipelines]: listPipelinesTool,
    [Tools.crm_create_contact]: createContactTool,
    [Tools.crm_update_contact]: updateContactTool,
    [Tools.crm_get_contact]: getContactTool,
    [Tools.crm_list_contacts]: listContactsTool,
    [Tools.crm_create_organization]: createOrganizationTool,
    [Tools.crm_create_deal]: createDealTool,
    [Tools.crm_update_deal]: updateDealTool,
    [Tools.crm_list_deals]: listDealsTool,
    [Tools.crm_log_activity]: logActivityTool,
    [Tools.crm_list_activities]: listActivitiesTool,
  };
}

module.exports = { createCRMTools };
