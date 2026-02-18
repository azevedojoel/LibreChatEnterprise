import type { Client } from '@hubspot/api-client';
import { z } from 'zod';
import { successResult, errorResult } from '../utils.js';

const listSchema = {
  limit: z.number().optional().describe('Max results (default 10)'),
  after: z.string().optional().describe('Pagination cursor'),
  properties: z.array(z.string()).optional().describe('Properties to return'),
};
const getSchema = {
  ticketId: z.string().describe('HubSpot ticket ID'),
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
  properties: z.record(z.string()).describe('Ticket properties e.g. {subject, content, hs_pipeline_stage}'),
};
const updateSchema = {
  ticketId: z.string().describe('HubSpot ticket ID'),
  properties: z.record(z.string()).describe('Properties to update'),
};

export function registerTicketTools(
  server: { registerTool: (name: string, options: unknown, handler: (arg: unknown) => Promise<unknown>) => void },
  getClient: () => Client
) {
  server.registerTool(
    'hubspot_tickets_list',
    {
      description: 'List HubSpot tickets with optional pagination.',
      inputSchema: listSchema,
    },
    async (input: { limit?: number; after?: string; properties?: string[] }) => {
      try {
        const client = getClient();
        const limit = input.limit ?? 10;
        const after = input.after;
        const properties = input.properties ?? ['subject', 'content', 'hs_pipeline_stage', 'createdate'];
        const result = await client.crm.tickets.basicApi.getPage(limit, after, properties);
        return successResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'hubspot_tickets_get',
    {
      description: 'Get a HubSpot ticket by ID.',
      inputSchema: getSchema,
    },
    async (input: { ticketId: string; properties?: string[] }) => {
      try {
        const client = getClient();
        const properties = input.properties ?? ['subject', 'content', 'hs_pipeline_stage', 'createdate', 'closedate'];
        const result = await client.crm.tickets.basicApi.getById(input.ticketId, properties);
        return successResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'hubspot_tickets_search',
    {
      description: 'Search HubSpot tickets with filters.',
      inputSchema: searchSchema,
    },
    async (input: { query?: string; limit?: number; after?: number | string; properties?: string[]; sorts?: string[] }) => {
      try {
        const client = getClient();
        const limit = input.limit ?? 10;
        const after = input.after ?? 0;
        const properties = input.properties ?? ['subject', 'hs_pipeline_stage', 'createdate'];
        const sorts = input.sorts ?? ['-createdate'];
        const filterGroups = input.query
          ? [{ filters: [{ propertyName: 'subject', operator: 'CONTAINS_TOKEN' as const, value: input.query }] }]
          : undefined;
        const body = {
          filterGroups: filterGroups ?? [{}],
          sorts,
          properties,
          limit,
          after: String(after),
        };
        const result = await client.crm.tickets.searchApi.doSearch(body);
        return successResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'hubspot_tickets_create',
    {
      description: 'Create a new HubSpot ticket.',
      inputSchema: createSchema,
    },
    async (input: { properties: Record<string, string> }) => {
      try {
        const client = getClient();
        const result = await client.crm.tickets.basicApi.create({ properties: input.properties });
        return successResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'hubspot_tickets_update',
    {
      description: 'Update a HubSpot ticket.',
      inputSchema: updateSchema,
    },
    async (input: { ticketId: string; properties: Record<string, string> }) => {
      try {
        const client = getClient();
        const result = await client.crm.tickets.basicApi.update(input.ticketId, {
          properties: input.properties,
        });
        return successResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}
