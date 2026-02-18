import { Constants, Tools } from 'librechat-data-provider';

/** Friendly display names for tools. Mirrors api/server/utils/toolDisplayNames.js */
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  [Tools.search_user_files]: 'Grepped',
  [Tools.workspace_glob_files]: 'Globbed',
  [Constants.TOOL_SEARCH]: 'Discovery',
  // Google Tasks tools
  tasks_listTaskLists: 'List Task Lists',
  'tasks.listTaskLists': 'List Task Lists',
  tasks_getTaskList: 'Get Task List',
  'tasks.getTaskList': 'Get Task List',
  tasks_createTaskList: 'Create Task List',
  'tasks.createTaskList': 'Create Task List',
  tasks_updateTaskList: 'Update Task List',
  'tasks.updateTaskList': 'Update Task List',
  tasks_deleteTaskList: 'Delete Task List',
  'tasks.deleteTaskList': 'Delete Task List',
  tasks_listTasks: 'List Tasks',
  'tasks.listTasks': 'List Tasks',
  tasks_getTask: 'Get Task',
  'tasks.getTask': 'Get Task',
  tasks_createTask: 'Create Task',
  'tasks.createTask': 'Create Task',
  tasks_updateTask: 'Update Task',
  'tasks.updateTask': 'Update Task',
  tasks_deleteTask: 'Delete Task',
  'tasks.deleteTask': 'Delete Task',
  tasks_clearCompletedTasks: 'Clear Completed Tasks',
  'tasks.clearCompletedTasks': 'Clear Completed Tasks',
  tasks_moveTask: 'Move Task',
  'tasks.moveTask': 'Move Task',
  // HubSpot tools
  hubspot_contacts_list: 'List Contacts',
  hubspot_contacts_get: 'Get Contact',
  hubspot_contacts_search: 'Search Contacts',
  hubspot_contacts_create: 'Create Contact',
  hubspot_contacts_update: 'Update Contact',
  hubspot_companies_list: 'List Companies',
  hubspot_companies_get: 'Get Company',
  hubspot_companies_search: 'Search Companies',
  hubspot_companies_create: 'Create Company',
  hubspot_companies_update: 'Update Company',
  hubspot_deals_list: 'List Deals',
  hubspot_deals_get: 'Get Deal',
  hubspot_deals_search: 'Search Deals',
  hubspot_deals_create: 'Create Deal',
  hubspot_deals_update: 'Update Deal',
  hubspot_tickets_list: 'List Tickets',
  hubspot_tickets_get: 'Get Ticket',
  hubspot_tickets_search: 'Search Tickets',
  hubspot_tickets_create: 'Create Ticket',
  hubspot_tickets_update: 'Update Ticket',
  hubspot_list_associations: 'List Associations',
  hubspot_create_association: 'Create Association',
  hubspot_create_note: 'Create Note',
  hubspot_create_task: 'Create Task',
  hubspot_get_engagement: 'Get Engagement',
  hubspot_auth_clear: 'Clear Auth',
};

/**
 * Humanize a tool name: hubspot_contacts_list -> "Hubspot Contacts List"
 */
export function humanizeToolName(name: string): string {
  if (!name || typeof name !== 'string') return 'Tool';
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Get friendly display name for a tool.
 * Handles MCP tools (e.g. hubspot_contacts_list_mcp_HubSpot -> "List Contacts").
 * @param rawName - Tool name or tool_id (e.g. hubspot_contacts_list or hubspot_contacts_list_mcp_HubSpot)
 */
export function getToolDisplayName(rawName: string): string {
  if (!rawName || typeof rawName !== 'string') return 'Tool';

  const mcpDelimiter = Constants.mcp_delimiter || '_mcp_';
  const functionName = rawName.includes(mcpDelimiter)
    ? rawName.split(mcpDelimiter)[0] || rawName
    : rawName;

  const exact = TOOL_DISPLAY_NAMES[functionName];
  if (exact) return exact;

  if (
    functionName === Constants.TOOL_SEARCH ||
    (typeof functionName === 'string' && functionName.startsWith('tool_search_mcp_'))
  ) {
    return TOOL_DISPLAY_NAMES[Constants.TOOL_SEARCH] || 'Discovery';
  }

  return humanizeToolName(functionName);
}
