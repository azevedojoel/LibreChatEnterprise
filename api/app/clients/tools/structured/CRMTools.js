/**
 * CRM Native Tools - call CRM services directly (no MCP, no HTTP).
 * Tools receive userId and projectId from the agent context.
 */
const { Tool } = require('@langchain/core/tools');

const toJson = (obj) => (typeof obj === 'string' ? obj : JSON.stringify(obj ?? null));

function sanitizeError(msg) {
  if (!msg) return 'Unable to access CRM data';
  if (/project|access denied/i.test(msg)) return 'Unable to access CRM data';
  return msg;
}

/**
 * @param {{ userId: string, projectId: string }} options
 * @returns {Record<string, Tool>}
 */
function createCRMTools({ userId, projectId }) {
  if (!projectId) {
    return {};
  }

  const pid = typeof projectId === 'string' ? projectId : projectId?.toString?.();
  const actorId = userId ?? 'agent';

  const CRM = require('~/server/services/CRM');
  const {
    listPipelines,
    createPipeline,
    updatePipeline,
    getDefaultPipeline,
    softDeletePipeline,
    listContacts,
    createContact,
    updateContact,
    getContactById,
    getContactByEmail,
    findContactsByName,
    softDeleteContact,
    createOrganization,
    getOrganizationById,
    getOrganizationByName,
    listOrganizations,
    softDeleteOrganization,
    listDeals,
    createDeal,
    updateDeal,
    getDealById,
    softDeleteDeal,
    listActivities,
    createActivity,
    touchContactLastActivity,
  } = CRM;

  const tools = {};

  tools.crm_list_pipelines = new (class extends Tool {
    name = 'crm_list_pipelines';
    description = 'List all CRM pipelines. Returns id, name, stages, isDefault.';
    schema = { type: 'object', properties: {} };
    static get jsonSchema() {
      return { type: 'object', properties: {} };
    }
    async _call() {
      try {
        const pipelines = await listPipelines(pid);
        return toJson(pipelines);
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to list pipelines' });
      }
    }
  })();

  tools.crm_create_pipeline = new (class extends Tool {
    name = 'crm_create_pipeline';
    description =
      'Create a CRM pipeline. Required: name, stages (array of stage names, e.g. ["Lead","Qualified","Proposal","Won"]). Optional: isDefault (boolean).';
    schema = {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Pipeline name' },
        stages: { type: 'array', items: { type: 'string' }, description: 'Stage names in order' },
        isDefault: { type: 'boolean', description: 'Set as default pipeline for new deals' },
      },
      required: ['name', 'stages'],
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { name, stages, isDefault } = args || {};
      if (!name) return toJson({ error: 'name is required' });
      if (!stages?.length) return toJson({ error: 'stages (array of strings) is required' });
      try {
        const pipeline = await createPipeline({
          projectId: pid,
          data: { name, stages, isDefault: isDefault ?? false },
        });
        return toJson(pipeline);
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to create pipeline' });
      }
    }
  })();

  tools.crm_update_pipeline = new (class extends Tool {
    name = 'crm_update_pipeline';
    description = 'Update a pipeline. Required: pipelineId. Optional: name, stages, isDefault.';
    schema = {
      type: 'object',
      properties: {
        pipelineId: { type: 'string', description: 'Pipeline ID' },
        name: { type: 'string' },
        stages: { type: 'array', items: { type: 'string' } },
        isDefault: { type: 'boolean' },
      },
      required: ['pipelineId'],
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { pipelineId, ...updates } = args || {};
      if (!pipelineId) return toJson({ error: 'pipelineId is required' });
      try {
        const pipeline = await updatePipeline(pid, pipelineId, updates);
        return toJson(pipeline);
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to update pipeline' });
      }
    }
  })();

  tools.crm_create_contact = new (class extends Tool {
    name = 'crm_create_contact';
    description =
      'Create a new CRM contact. Required: name. Optional: email, phone, tags, source, status (lead|prospect|customer), organizationId.';
    schema = {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Contact name' },
        email: { type: 'string' },
        phone: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
        status: { type: 'string', enum: ['lead', 'prospect', 'customer'] },
        organizationId: { type: 'string' },
        customFields: {
          type: 'object',
          description: 'Additional key-value pairs (e.g. "Farm Size": "240 acres")',
        },
      },
      required: ['name'],
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { name, email, phone, tags, source, status, organizationId, customFields } = args || {};
      if (!name) return toJson({ error: 'name is required' });
      if (email) {
        const existing = await getContactByEmail(pid, email);
        if (existing)
          return toJson({
            error: 'Duplicate contact: A contact with this email already exists.',
            existingContactId: existing._id?.toString?.() ?? existing._id,
            suggestion: 'Use crm_get_contact to retrieve it or crm_update_contact to update.',
          });
      }
      try {
        const contact = await createContact({
          projectId: pid,
          data: {
            name,
            email,
            phone,
            tags: tags || [],
            source: source || 'agent',
            status: status || 'lead',
            ownerType: 'user',
            ownerId: actorId,
            organizationId,
            customFields,
          },
          actorId,
          actorType: 'user',
        });
        return toJson(contact);
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to create contact' });
      }
    }
  })();

  tools.crm_update_contact = new (class extends Tool {
    name = 'crm_update_contact';
    description =
      'Update an existing contact. Required: contactId. Optional: name, email, phone, tags, source, status, organizationId.';
    schema = {
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
        customFields: {
          type: 'object',
          description: 'Additional key-value pairs (e.g. "Farm Size": "240 acres")',
        },
      },
      required: ['contactId'],
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { contactId, ...updates } = args || {};
      if (!contactId) return toJson({ error: 'contactId is required' });
      try {
        const contact = await updateContact({
          projectId: pid,
          contactId,
          updates,
          actorId,
          actorType: 'user',
        });
        return toJson(contact);
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to update contact' });
      }
    }
  })();

  tools.crm_get_contact = new (class extends Tool {
    name = 'crm_get_contact';
    description = 'Get a contact by ID, email, or name (fuzzy). Provide contactId, email, OR name.';
    schema = {
      type: 'object',
      properties: {
        contactId: { type: 'string' },
        email: { type: 'string' },
        name: { type: 'string' },
      },
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { contactId, email, name } = args || {};
      if (!contactId && !email && !name) {
        return toJson({ error: 'contactId, email, or name is required' });
      }
      try {
        if (contactId) {
          const contact = await getContactById(pid, contactId);
          return toJson(contact);
        }
        if (email) {
          const contact = await getContactByEmail(pid, email);
          return toJson(contact);
        }
        const matches = await findContactsByName(pid, name, 1);
        return toJson(matches[0] ?? null);
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to get contact' });
      }
    }
  })();

  tools.crm_list_contacts = new (class extends Tool {
    name = 'crm_list_contacts';
    description =
      'List contacts with optional filters. Use query to search by name or email. Use noActivitySinceDays to find leads with no follow-up (e.g. 3 for 3 days). Optional: status (lead|prospect|customer), tags, noActivitySinceDays, query, limit, skip.';
    schema = {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['lead', 'prospect', 'customer'] },
        tags: { type: 'array', items: { type: 'string' } },
        noActivitySinceDays: { type: 'number' },
        query: {
          type: 'string',
          description: 'Search by name or email (case-insensitive partial match)',
        },
        limit: { type: 'number' },
        skip: { type: 'number' },
      },
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args = {}) {
      try {
        const contacts = await listContacts({
          projectId: pid,
          status: args.status,
          tags: args.tags,
          noActivitySinceDays: args.noActivitySinceDays,
          query: args.query,
          limit: args.limit ?? 50,
          skip: args.skip ?? 0,
        });
        return toJson(contacts);
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to list contacts' });
      }
    }
  })();

  tools.crm_create_organization = new (class extends Tool {
    name = 'crm_create_organization';
    description =
      'Create an organization (company). Required: name. Optional: domain, metadata, customFields (e.g. "Size": "240 acres", "Industry": "Agriculture").';
    schema = {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Organization name' },
        domain: { type: 'string' },
        metadata: { type: 'object' },
        customFields: {
          type: 'object',
          description: 'Additional key-value pairs (e.g. "Industry": "Agriculture")',
        },
      },
      required: ['name'],
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { name, domain, metadata, customFields } = args || {};
      if (!name) return toJson({ error: 'name is required' });
      try {
        const org = await createOrganization({
          projectId: pid,
          data: { name, domain, metadata, customFields },
        });
        return toJson(org);
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to create organization' });
      }
    }
  })();

  tools.crm_get_organization = new (class extends Tool {
    name = 'crm_get_organization';
    description =
      'Get an organization by ID or name. Provide organizationId OR name (exact match, case-insensitive). Use the _id or id returned from crm_create_organization when calling by organizationId.';
    schema = {
      type: 'object',
      properties: {
        organizationId: {
          type: 'string',
          description:
            'Organization ID. Use the _id or id returned from crm_create_organization when calling by ID.',
        },
        name: { type: 'string', description: 'Organization name (exact match, case-insensitive)' },
      },
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { organizationId, name } = args || {};
      if (!organizationId && !name) {
        return toJson({ error: 'organizationId or name is required' });
      }
      try {
        if (organizationId) {
          const org = await getOrganizationById(pid, organizationId);
          if (!org) return toJson({ error: 'Organization not found' });
          return toJson(org);
        }
        const org = await getOrganizationByName(pid, name);
        if (!org) return toJson({ error: 'Organization not found' });
        return toJson(org);
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to get organization' });
      }
    }
  })();

  tools.crm_list_organizations = new (class extends Tool {
    name = 'crm_list_organizations';
    description = 'List organizations. Use query to search by name. Optional: query, limit, skip.';
    schema = {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search by organization name (case-insensitive partial match)',
        },
        limit: { type: 'number' },
        skip: { type: 'number' },
      },
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args = {}) {
      try {
        const orgs = await listOrganizations(pid, {
          query: args.query,
          limit: args.limit ?? 50,
          skip: args.skip ?? 0,
        });
        return toJson(orgs);
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to list organizations' });
      }
    }
  })();

  tools.crm_create_deal = new (class extends Tool {
    name = 'crm_create_deal';
    description =
      'Create a deal. Required: pipelineId (or use default), stage. Optional: title, description, contactId, organizationId, value, expectedCloseDate (ISO), probability (0-100%), customFields.';
    schema = {
      type: 'object',
      properties: {
        pipelineId: { type: 'string' },
        stage: { type: 'string', description: 'Stage name from pipeline' },
        title: {
          type: 'string',
          description:
            'Human-readable deal title (e.g. "Farm Liability & Property Insurance Package"). Defaults to "Untitled Deal" if omitted.',
        },
        description: { type: 'string', description: 'Additional context or notes for the deal' },
        contactId: { type: 'string' },
        organizationId: { type: 'string' },
        value: { type: 'number' },
        expectedCloseDate: { type: 'string' },
        probability: { type: 'number', description: 'Win probability 0-100%' },
        customFields: {
          type: 'object',
          description: 'Additional key-value pairs (e.g. "Product": "Enterprise Plan")',
        },
      },
      required: ['stage'],
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const {
        pipelineId,
        stage,
        title,
        description,
        contactId,
        organizationId,
        value,
        expectedCloseDate,
        probability,
        customFields,
      } = args || {};
      if (!stage) return toJson({ error: 'stage is required' });
      try {
        let resolvedPipelineId = pipelineId;
        if (!resolvedPipelineId) {
          const defaultPipeline = await getDefaultPipeline(pid);
          if (!defaultPipeline) return toJson({ error: 'No pipeline exists. Create a pipeline first.' });
          resolvedPipelineId = defaultPipeline._id?.toString?.() ?? defaultPipeline._id;
        }
        const deal = await createDeal({
          projectId: pid,
          data: {
            pipelineId: resolvedPipelineId,
            stage,
            title,
            description,
            contactId,
            organizationId,
            value,
            expectedCloseDate,
            probability,
            customFields,
            ownerType: 'user',
            ownerId: actorId,
          },
          actorId,
          actorType: 'user',
        });
        return toJson(deal);
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to create deal' });
      }
    }
  })();

  tools.crm_update_deal = new (class extends Tool {
    name = 'crm_update_deal';
    description =
      'Update a deal. Required: dealId. Optional: stage, title, description, contactId, organizationId, value, expectedCloseDate, probability (0-100%), customFields.';
    schema = {
      type: 'object',
      properties: {
        dealId: { type: 'string' },
        stage: { type: 'string' },
        title: { type: 'string', description: 'Human-readable deal title' },
        description: { type: 'string', description: 'Additional context or notes' },
        contactId: { type: 'string' },
        organizationId: { type: 'string' },
        value: { type: 'number' },
        expectedCloseDate: { type: 'string' },
        probability: { type: 'number', description: 'Win probability 0-100%' },
        customFields: {
          type: 'object',
          description: 'Additional key-value pairs',
        },
      },
      required: ['dealId'],
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { dealId, ...updates } = args || {};
      if (!dealId) return toJson({ error: 'dealId is required' });
      try {
        const existing = await getDealById(pid, dealId);
        const deal = await updateDeal({
          projectId: pid,
          dealId,
          updates,
          previousStage: existing?.stage,
          actorId,
          actorType: 'user',
        });
        return toJson(deal);
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to update deal' });
      }
    }
  })();

  tools.crm_list_deals = new (class extends Tool {
    name = 'crm_list_deals';
    description =
      'List deals. Use query to search by title or description. Optional: pipelineId, stage, contactId, query, limit, skip.';
    schema = {
      type: 'object',
      properties: {
        pipelineId: { type: 'string' },
        stage: { type: 'string' },
        contactId: { type: 'string' },
        query: {
          type: 'string',
          description: 'Search by deal title or description (case-insensitive partial match)',
        },
        limit: { type: 'number' },
        skip: { type: 'number' },
      },
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args = {}) {
      try {
        const deals = await listDeals({
          projectId: pid,
          pipelineId: args.pipelineId,
          stage: args.stage,
          contactId: args.contactId,
          query: args.query,
          limit: args.limit ?? 50,
          skip: args.skip ?? 0,
        });
        return toJson(deals);
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to list deals' });
      }
    }
  })();

  tools.crm_log_activity = new (class extends Tool {
    name = 'crm_log_activity';
    description =
      'Log an activity (e.g. call_logged, email_sent). Required: type, contactId or dealId. Optional: summary, metadata. Types: email_sent, email_received, call_logged, agent_action, doc_matched, stage_change.';
    schema = {
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
        dueDate: { type: 'string', description: 'When the activity/task is due (ISO date)' },
        status: { type: 'string', description: 'e.g. pending, completed, cancelled' },
        priority: { type: 'string', description: 'e.g. low, medium, high, urgent' },
        assignedUserId: { type: 'string', description: 'User ID for follow-up assignment' },
      },
      required: ['type'],
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { contactId, dealId, type, summary, metadata, dueDate, status, priority, assignedUserId } = args || {};
      if (!type) return toJson({ error: 'type is required' });
      if (!contactId && !dealId) return toJson({ error: 'contactId or dealId is required' });
      try {
        const activity = await createActivity({
          projectId: pid,
          contactId,
          dealId,
          type,
          actorType: 'user',
          actorId,
          summary,
          metadata,
          dueDate,
          status,
          priority,
          assignedUserId,
        });
        if (contactId) await touchContactLastActivity(contactId);
        return toJson(activity);
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to log activity' });
      }
    }
  })();

  tools.crm_list_activities = new (class extends Tool {
    name = 'crm_list_activities';
    description =
      'List activities for a contact or deal. Provide contactId OR dealId. Optional: limit, skip.';
    schema = {
      type: 'object',
      properties: {
        contactId: { type: 'string' },
        dealId: { type: 'string' },
        limit: { type: 'number' },
        skip: { type: 'number' },
      },
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args = {}) {
      try {
        const activities = await listActivities({
          projectId: pid,
          contactId: args.contactId,
          dealId: args.dealId,
          limit: args.limit ?? 50,
          skip: args.skip ?? 0,
        });
        return toJson(activities);
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to list activities' });
      }
    }
  })();

  tools.crm_soft_delete_contact = new (class extends Tool {
    name = 'crm_soft_delete_contact';
    description = 'Soft delete a contact. Required: contactId.';
    schema = {
      type: 'object',
      properties: { contactId: { type: 'string' } },
      required: ['contactId'],
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { contactId } = args || {};
      if (!contactId) return toJson({ error: 'contactId is required' });
      try {
        const result = await softDeleteContact(pid, contactId);
        return toJson(result ? { deleted: true, _id: result._id } : { error: 'Contact not found' });
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to soft delete contact' });
      }
    }
  })();

  tools.crm_soft_delete_organization = new (class extends Tool {
    name = 'crm_soft_delete_organization';
    description = 'Soft delete an organization. Required: organizationId.';
    schema = {
      type: 'object',
      properties: { organizationId: { type: 'string' } },
      required: ['organizationId'],
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { organizationId } = args || {};
      if (!organizationId) return toJson({ error: 'organizationId is required' });
      try {
        const result = await softDeleteOrganization(pid, organizationId);
        return toJson(result ? { deleted: true, _id: result._id } : { error: 'Organization not found' });
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to soft delete organization' });
      }
    }
  })();

  tools.crm_soft_delete_deal = new (class extends Tool {
    name = 'crm_soft_delete_deal';
    description = 'Soft delete a deal. Required: dealId.';
    schema = {
      type: 'object',
      properties: { dealId: { type: 'string' } },
      required: ['dealId'],
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { dealId } = args || {};
      if (!dealId) return toJson({ error: 'dealId is required' });
      try {
        const result = await softDeleteDeal(pid, dealId);
        return toJson(result ? { deleted: true, _id: result._id } : { error: 'Deal not found' });
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to soft delete deal' });
      }
    }
  })();

  tools.crm_soft_delete_pipeline = new (class extends Tool {
    name = 'crm_soft_delete_pipeline';
    description = 'Soft delete a pipeline. Required: pipelineId. Fails if deals exist.';
    schema = {
      type: 'object',
      properties: { pipelineId: { type: 'string' } },
      required: ['pipelineId'],
    };
    static get jsonSchema() {
      return this.prototype.schema;
    }
    async _call(args) {
      const { pipelineId } = args || {};
      if (!pipelineId) return toJson({ error: 'pipelineId is required' });
      try {
        const result = await softDeletePipeline(pid, pipelineId);
        return toJson(result ? { deleted: true, _id: result._id } : { error: 'Pipeline not found' });
      } catch (e) {
        return toJson({ error: sanitizeError(e?.message) || 'Failed to soft delete pipeline' });
      }
    }
  })();

  return tools;
}

module.exports = { createCRMTools };
