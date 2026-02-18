import type { Client } from '@hubspot/api-client';
import { z } from 'zod';
import { successResult, errorResult } from '../utils.js';

const listSchema = {
  limit: z.number().optional().describe('Max results (default 10)'),
  after: z.string().optional().describe('Pagination cursor'),
  properties: z.array(z.string()).optional().describe('Properties to return'),
};
const getSchema = {
  contactId: z.string().describe('HubSpot contact ID'),
  properties: z.array(z.string()).optional().describe('Properties to return'),
};
const searchSchema = {
  query: z.string().optional().describe('Search query filter'),
  limit: z.number().optional().describe('Max results (default 10)'),
  after: z.union([z.number(), z.string()]).optional().describe('Pagination offset'),
  properties: z.array(z.string()).optional().describe('Properties to return'),
  sorts: z.array(z.string()).optional().describe('Sort fields e.g. ["-createdate"]'),
};
const createSchema = {
  properties: z.record(z.string()).describe('Contact properties e.g. {firstname, lastname, email}'),
};
const updateSchema = {
  contactId: z.string().describe('HubSpot contact ID'),
  properties: z.record(z.string()).describe('Properties to update'),
};

export function registerContactTools(
  server: { registerTool: (name: string, options: unknown, handler: (arg: unknown) => Promise<unknown>) => void },
  getClient: () => Client
) {
  server.registerTool(
    'hubspot_contacts_list',
    {
      description: 'List HubSpot contacts with optional pagination.',
      inputSchema: listSchema,
    },
    async (input: { limit?: number; after?: string; properties?: string[] }) => {
      try {
        const client = getClient();
        const limit = input.limit ?? 10;
        const after = input.after;
        const properties = input.properties ?? ['firstname', 'lastname', 'email', 'createdate'];
        const result = await client.crm.contacts.basicApi.getPage(limit, after, properties);
        return successResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'hubspot_contacts_get',
    {
      description: 'Get a HubSpot contact by ID.',
      inputSchema: getSchema,
    },
    async (input: { contactId: string; properties?: string[] }) => {
      try {
        const client = getClient();
        const properties = input.properties ?? ['firstname', 'lastname', 'email', 'company', 'createdate'];
        const result = await client.crm.contacts.basicApi.getById(input.contactId, properties);
        return successResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'hubspot_contacts_search',
    {
      description: 'Search HubSpot contacts with filters. Supports filterGroups with propertyName, operator (EQ, NEQ, LT, LTE, GT, GTE, CONTAINS_TOKEN), value.',
      inputSchema: searchSchema,
    },
    async (input: { query?: string; limit?: number; after?: number | string; properties?: string[]; sorts?: string[] }) => {
      try {
        const client = getClient();
        const limit = input.limit ?? 10;
        const after = input.after ?? 0;
        const properties = input.properties ?? ['firstname', 'lastname', 'email', 'createdate'];
        const sorts = input.sorts ?? ['-createdate'];
        const filterGroups = input.query
          ? [{ filters: [{ propertyName: 'email', operator: 'CONTAINS_TOKEN' as const, value: input.query }] }]
          : undefined;
        const body = {
          filterGroups: filterGroups ?? [{}],
          sorts,
          properties,
          limit,
          after: String(after),
        };
        const result = await client.crm.contacts.searchApi.doSearch(body);
        return successResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'hubspot_contacts_create',
    {
      description: 'Create a new HubSpot contact.',
      inputSchema: createSchema,
    },
    async (input: { properties: Record<string, string> }) => {
      try {
        const client = getClient();
        const result = await client.crm.contacts.basicApi.create({ properties: input.properties });
        return successResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'hubspot_contacts_update',
    {
      description: 'Update a HubSpot contact.',
      inputSchema: updateSchema,
    },
    async (input: { contactId: string; properties: Record<string, string> }) => {
      try {
        const client = getClient();
        const result = await client.crm.contacts.basicApi.update(input.contactId, {
          properties: input.properties,
        });
        return successResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}
