#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getHubSpotClient } from './client.js';
import { registerContactTools } from './tools/contacts.js';
import { registerCompanyTools } from './tools/companies.js';
import { registerDealTools } from './tools/deals.js';
import { registerTicketTools } from './tools/tickets.js';
import { registerEngagementTools } from './tools/engagements.js';
import { registerAssociationTools } from './tools/associations.js';
import { registerAuthTools } from './tools/auth.js';

async function main() {
  const server = new McpServer({
    name: 'hubspot-mcp-server',
    version: '1.0.0',
  });

  const getClient = () => getHubSpotClient();

  registerAuthTools(server);
  registerContactTools(server, getClient);
  registerCompanyTools(server, getClient);
  registerDealTools(server, getClient);
  registerTicketTools(server, getClient);
  registerEngagementTools(server, getClient);
  registerAssociationTools(server, getClient);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('HubSpot MCP Server is running. Listening for requests...');
}

main().catch((error) => {
  console.error('A critical error occurred:', error);
  process.exit(1);
});
