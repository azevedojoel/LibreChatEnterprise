import type { Client } from '@hubspot/api-client';
import { z } from 'zod';
import { successResult, errorResult } from '../utils.js';

const listSchema = {
  fromObjectType: z
    .enum(['contacts', 'companies', 'deals', 'tickets', 'notes', 'tasks'])
    .describe('Source object type'),
  fromObjectId: z.string().describe('Source object ID'),
  toObjectType: z
    .enum(['contacts', 'companies', 'deals', 'tickets', 'notes', 'tasks'])
    .describe('Target object type'),
  after: z.string().optional().describe('Pagination cursor'),
  limit: z.number().optional().describe('Max results (default 100)'),
};
const createSchema = {
  fromObjectType: z
    .enum(['contacts', 'companies', 'deals', 'tickets', 'notes', 'tasks'])
    .describe('Source object type'),
  fromObjectId: z.string().describe('Source object ID'),
  toObjectType: z
    .enum(['contacts', 'companies', 'deals', 'tickets', 'notes', 'tasks'])
    .describe('Target object type'),
  toObjectId: z.string().describe('Target object ID'),
  associationTypeId: z.number().optional().describe('Association type ID (HubSpot-defined or custom)'),
};

export function registerAssociationTools(
  server: { registerTool: (name: string, options: unknown, handler: (arg: unknown) => Promise<unknown>) => void },
  getClient: () => Client
) {
  server.registerTool(
    'hubspot_list_associations',
    {
      description:
        'List associations from one object to another (e.g. contacts for a company, companies for a contact).',
      inputSchema: listSchema,
    },
    async (input: {
      fromObjectType: string;
      fromObjectId: string;
      toObjectType: string;
      after?: string;
      limit?: number;
    }) => {
      try {
        const client = getClient();
        const limit = input.limit ?? 100;
        const result = await client.crm.associations.v4.basicApi.getPage(
          input.fromObjectType,
          input.fromObjectId,
          input.toObjectType,
          input.after,
          limit
        );
        return successResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'hubspot_create_association',
    {
      description:
        'Create an association between two objects (e.g. associate a contact with a company).',
      inputSchema: createSchema,
    },
    async (input: {
      fromObjectType: string;
      fromObjectId: string;
      toObjectType: string;
      toObjectId: string;
      associationTypeId?: number;
    }) => {
      try {
        const client = getClient();
        const typeId =
          input.associationTypeId ??
          (input.fromObjectType === 'contacts' && input.toObjectType === 'companies' ? 1 : 1);
        await client.crm.associations.v4.basicApi.create(
          input.fromObjectType,
          input.fromObjectId,
          input.toObjectType,
          input.toObjectId,
          [{ associationCategory: 'HUBSPOT_DEFINED' as const, associationTypeId: typeId }]
        );
        return successResult({ success: true, message: 'Association created' });
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}
