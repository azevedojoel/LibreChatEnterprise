import { Constants, Tools } from 'librechat-data-provider';

/** Friendly display names for tools. Mirrors api/server/utils/toolDisplayNames.js */
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  [Tools.search_user_files]: 'Grepped',
  [Tools.workspace_glob_files]: 'Globbed',
  [Tools.workspace_read_file]: 'Read File',
  [Tools.workspace_edit_file]: 'Edit File',
  [Tools.workspace_create_file]: 'Create File',
  [Tools.workspace_delete_file]: 'Delete File',
  [Tools.workspace_list_files]: 'List Files',
  [Tools.workspace_send_file_to_user]: 'Send File to User',
  [Tools.execute_code]: 'Code Interpreter',
  [Constants.TOOL_SEARCH]: 'Discovery',
  // Google Workspace MCP tools (underscore notation)
  tasks_listTaskLists: 'Listing Google Task Lists',
  tasks_getTaskList: 'Getting Google Task List',
  tasks_createTaskList: 'Creating Google Task List',
  tasks_updateTaskList: 'Updating Google Task List',
  tasks_deleteTaskList: 'Deleting Google Task List',
  tasks_listTasks: 'Listing Google Tasks',
  tasks_getTask: 'Getting Google Task',
  tasks_createTask: 'Creating Google Task',
  tasks_updateTask: 'Updating Google Task',
  tasks_deleteTask: 'Deleting Google Task',
  tasks_clearCompletedTasks: 'Clearing Completed Google Tasks',
  tasks_moveTask: 'Moving Google Task',
  drive_search: 'Searched Google Drive',
  gmail_search: 'Searched Gmail',
  gmail_get: 'Retrieved email',
  docs_create: 'Creating Google Doc',
  // Microsoft To Do MCP tools (hyphen notation)
  'list-todo-tasks': 'Listed To Do tasks',
  'list-todo-task-lists': 'Listed To Do lists',
  'create-todo-task': 'Creating To Do task',
  'update-todo-task': 'Updating To Do task',
  'delete-todo-task': 'Deleting To Do task',
  // Project tools
  project_read: 'Project Context',
  project_write: 'Update Project Context',
  project_log: 'Append to Changelog',
  project_log_tail: 'Recent Changelog Entries',
  project_log_search: 'Search Changelog',
  project_log_range: 'Changelog by Date Range',
};

/**
 * Humanize a tool name: get_contacts_list -> "Get Contacts List"
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
 * Handles MCP tools (e.g. get_contacts_mcp_TestServer -> "Get Contacts").
 * @param rawName - Tool name or tool_id (e.g. get_contacts or get_contacts_mcp_TestServer)
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
