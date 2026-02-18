import type { Client } from '@hubspot/api-client';
import { z } from 'zod';
import { successResult, errorResult } from '../utils.js';

const listSchema = {
  limit: z.number().optional().describe('Max results (default 10)'),
  after: z.string().optional().describe('Pagination cursor'),
  properties: z.array(z.string()).optional().describe('Properties to return'),
};
const getSchema = {
  companyId: z.string().describe('HubSpot company ID'),
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
  properties: z.record(z.string()).describe('Company properties e.g. {name, domain}'),
};
const updateSchema = {
  companyId: z.string().describe('HubSpot company ID'),
  properties: z.record(z.string()).describe('Properties to update'),
};

export function registerCompanyTools(
  server: { registerTool: (name: string, options: unknown, handler: (arg: unknown) => Promise<unknown>) => void },
  getClient: () => Client
) {
  server.registerTool(
    'hubspot_companies_list',
    {
      description: 'List HubSpot companies with optional pagination.',
      inputSchema: listSchema,
    },
    async (input: { limit?: number; after?: string; properties?: string[] }) => {
      try {
        const client = getClient();
        const limit = input.limit ?? 10;
        const after = input.after;
        const properties = input.properties ?? ['name', 'domain', 'createdate'];
        const result = await client.crm.companies.basicApi.getPage(limit, after, properties);
        return successResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'hubspot_companies_get',
    {
      description: 'Get a HubSpot company by ID.',
      inputSchema: getSchema,
    },
    async (input: { companyId: string; properties?: string[] }) => {
      try {
        const client = getClient();
        const properties = input.properties ?? ['name', 'domain', 'industry', 'createdate'];
        const result = await client.crm.companies.basicApi.getById(input.companyId, properties);
        return successResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'hubspot_companies_search',
    {
      description: 'Search HubSpot companies with filters.',
      inputSchema: searchSchema,
    },
    async (input: { query?: string; limit?: number; after?: number | string; properties?: string[]; sorts?: string[] }) => {
      try {
        const client = getClient();
        const limit = input.limit ?? 10;
        const after = input.after ?? 0;
        const properties = input.properties ?? ['name', 'domain', 'createdate'];
        const sorts = input.sorts ?? ['-createdate'];
        const filterGroups = input.query
          ? [{ filters: [{ propertyName: 'name', operator: 'CONTAINS_TOKEN' as const, value: input.query }] }]
          : undefined;
        const body = {
          filterGroups: filterGroups ?? [{}],
          sorts,
          properties,
          limit,
          after: String(after),
        };
        const result = await client.crm.companies.searchApi.doSearch(body);
        return successResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'hubspot_companies_create',
    {
      description: 'Create a new HubSpot company.',
      inputSchema: createSchema,
    },
    async (input: { properties: Record<string, string> }) => {
      try {
        const client = getClient();
        const result = await client.crm.companies.basicApi.create({ properties: input.properties });
        return successResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'hubspot_companies_update',
    {
      description: 'Update a HubSpot company.',
      inputSchema: updateSchema,
    },
    async (input: { companyId: string; properties: Record<string, string> }) => {
      try {
        const client = getClient();
        const result = await client.crm.companies.basicApi.update(input.companyId, {
          properties: input.properties,
        });
        return successResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}
