import type { Client } from '@hubspot/api-client';
import { z } from 'zod';
import { successResult, errorResult } from '../utils.js';

const associationItemSchema = z.object({
  toObjectType: z.enum(['contacts', 'companies', 'deals', 'tickets']).describe('Target object type'),
  toObjectId: z.string().describe('Target object ID'),
});
const createNoteSchema = {
  body: z.string().describe('Note content/body'),
  subject: z.string().optional().describe('Note subject'),
  associations: z.array(associationItemSchema).optional().describe('Associate with contact/company/deal/ticket'),
};
const createTaskSchema = {
  subject: z.string().describe('Task subject/title'),
  body: z.string().optional().describe('Task description'),
  dueDate: z.string().optional().describe('Due date in ms timestamp or ISO string'),
  associations: z.array(associationItemSchema).optional().describe('Associate with contact/company/deal/ticket'),
};
const getEngagementSchema = {
  objectType: z.enum(['notes', 'tasks']).describe('Engagement type'),
  engagementId: z.string().describe('Engagement ID'),
};

const ASSOCIATION_TYPES = {
  noteToContact: 202,
  noteToCompany: 190,
  noteToDeal: 214,
  noteToTicket: 216,
  taskToContact: 203,
  taskToCompany: 191,
  taskToDeal: 215,
  taskToTicket: 217,
} as const;

function getNoteAssociationType(toObjectType: string): number {
  const map: Record<string, number> = {
    contacts: 202,
    companies: 190,
    deals: 214,
    tickets: 216,
  };
  return map[toObjectType] ?? 202;
}

function getTaskAssociationType(toObjectType: string): number {
  const map: Record<string, number> = {
    contacts: 203,
    companies: 191,
    deals: 215,
    tickets: 217,
  };
  return map[toObjectType] ?? 203;
}

export function registerEngagementTools(
  server: { registerTool: (name: string, options: unknown, handler: (arg: unknown) => Promise<unknown>) => void },
  getClient: () => Client
) {
  server.registerTool(
    'hubspot_create_note',
    {
      description: 'Create a HubSpot note. Optionally associate with a contact, company, deal, or ticket.',
      inputSchema: createNoteSchema,
    },
    async (input: {
      body: string;
      subject?: string;
      associations?: Array<{ toObjectType: string; toObjectId: string }>;
    }) => {
      try {
        const client = getClient();
        const properties: Record<string, string> = {
          hs_note_body: input.body,
          hs_timestamp: String(Date.now()),
        };
        if (input.subject) properties.hs_title = input.subject;
        const result = await client.crm.objects.notes.basicApi.create({ properties });
        if (input.associations?.length) {
          for (const assoc of input.associations) {
            await client.crm.associations.v4.basicApi.create(
              'notes',
              result.id,
              assoc.toObjectType,
              assoc.toObjectId,
              [{ associationCategory: 'HUBSPOT_DEFINED' as const, associationTypeId: getNoteAssociationType(assoc.toObjectType) }]
            );
          }
        }
        return successResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'hubspot_create_task',
    {
      description: 'Create a HubSpot task. Optionally associate with a contact, company, deal, or ticket.',
      inputSchema: createTaskSchema,
    },
    async (input: {
      subject: string;
      body?: string;
      dueDate?: string;
      associations?: Array<{ toObjectType: string; toObjectId: string }>;
    }) => {
      try {
        const client = getClient();
        const properties: Record<string, string> = {
          hs_task_subject: input.subject,
          hs_timestamp: String(Date.now()),
        };
        if (input.body) properties.hs_task_body = input.body;
        if (input.dueDate) properties.hs_next_step = input.dueDate;
        const result = await client.crm.objects.tasks.basicApi.create({ properties });
        if (input.associations?.length) {
          for (const assoc of input.associations) {
            await client.crm.associations.v4.basicApi.create(
              'tasks',
              result.id,
              assoc.toObjectType,
              assoc.toObjectId,
              [{ associationCategory: 'HUBSPOT_DEFINED' as const, associationTypeId: getTaskAssociationType(assoc.toObjectType) }]
            );
          }
        }
        return successResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'hubspot_get_engagement',
    {
      description: 'Get a HubSpot note or task by ID.',
      inputSchema: getEngagementSchema,
    },
    async (input: { objectType: 'notes' | 'tasks'; engagementId: string }) => {
      try {
        const client = getClient();
        if (input.objectType === 'notes') {
          const result = await client.crm.objects.notes.basicApi.getById(input.engagementId);
          return successResult(result);
        }
        const result = await client.crm.objects.tasks.basicApi.getById(input.engagementId);
        return successResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}
