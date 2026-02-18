import type { Client } from '@hubspot/api-client';
import { z } from 'zod';
import { successResult, errorResult } from '../utils.js';

const listSchema = {
  limit: z.number().optional().describe('Max results (default 10)'),
  after: z.string().optional().describe('Pagination cursor'),
  properties: z.array(z.string()).optional().describe('Properties to return'),
};
const getSchema = {
  dealId: z.string().describe('HubSpot deal ID'),
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
  properties: z.record(z.string()).describe('Deal properties e.g. {dealname, amount, dealstage}'),
};
const updateSchema = {
  dealId: z.string().describe('HubSpot deal ID'),
  properties: z.record(z.string()).describe('Properties to update'),
};

export function registerDealTools(
  server: { registerTool: (name: string, options: unknown, handler: (arg: unknown) => Promise<unknown>) => void },
  getClient: () => Client
) {
  server.registerTool(
    'hubspot_deals_list',
    {
      description: 'List HubSpot deals with optional pagination.',
      inputSchema: listSchema,
    },
    async (input: { limit?: number; after?: string; properties?: string[] }) => {
      try {
        const client = getClient();
        const limit = input.limit ?? 10;
        const after = input.after;
        const properties = input.properties ?? ['dealname', 'amount', 'dealstage', 'createdate'];
        const result = await client.crm.deals.basicApi.getPage(limit, after, properties);
        return successResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'hubspot_deals_get',
    {
      description: 'Get a HubSpot deal by ID.',
      inputSchema: getSchema,
    },
    async (input: { dealId: string; properties?: string[] }) => {
      try {
        const client = getClient();
        const properties = input.properties ?? ['dealname', 'amount', 'dealstage', 'closedate', 'createdate'];
        const result = await client.crm.deals.basicApi.getById(input.dealId, properties);
        return successResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'hubspot_deals_search',
    {
      description: 'Search HubSpot deals with filters.',
      inputSchema: searchSchema,
    },
    async (input: { query?: string; limit?: number; after?: number | string; properties?: string[]; sorts?: string[] }) => {
      try {
        const client = getClient();
        const limit = input.limit ?? 10;
        const after = input.after ?? 0;
        const properties = input.properties ?? ['dealname', 'amount', 'dealstage', 'createdate'];
        const sorts = input.sorts ?? ['-createdate'];
        const filterGroups = input.query
          ? [{ filters: [{ propertyName: 'dealname', operator: 'CONTAINS_TOKEN' as const, value: input.query }] }]
          : undefined;
        const body = {
          filterGroups: filterGroups ?? [{}],
          sorts,
          properties,
          limit,
          after: String(after),
        };
        const result = await client.crm.deals.searchApi.doSearch(body);
        return successResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'hubspot_deals_create',
    {
      description: 'Create a new HubSpot deal.',
      inputSchema: createSchema,
    },
    async (input: { properties: Record<string, string> }) => {
      try {
        const client = getClient();
        const result = await client.crm.deals.basicApi.create({ properties: input.properties });
        return successResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'hubspot_deals_update',
    {
      description: 'Update a HubSpot deal.',
      inputSchema: updateSchema,
    },
    async (input: { dealId: string; properties: Record<string, string> }) => {
      try {
        const client = getClient();
        const result = await client.crm.deals.basicApi.update(input.dealId, {
          properties: input.properties,
        });
        return successResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}
