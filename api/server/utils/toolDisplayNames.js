/**
 * Server-side tool display names for email formatting.
 * Mirrors client TOOL_DISPLAY_NAMES in ToolCall.tsx for consistency.
 */
const { Constants } = require('librechat-data-provider');

const TOOL_DISPLAY_NAMES = {
  search_user_files: 'Grepped',
  workspace_glob_files: 'Globbed',
  workspace_read_file: 'Read File',
  workspace_edit_file: 'Edit File',
  workspace_create_file: 'Create File',
  workspace_delete_file: 'Delete File',
  workspace_list_files: 'List Files',
  workspace_send_file_to_user: 'Send File to User',
  [Constants.TOOL_SEARCH]: 'Discovery',
  // Google Workspace MCP tools (underscore notation)
  tasks_listTaskLists: 'Fetch Task Lists',
  tasks_getTaskList: 'Fetch Task List',
  tasks_createTaskList: 'Create Task List',
  tasks_updateTaskList: 'Update Task List',
  tasks_deleteTaskList: 'Delete Task List',
  tasks_listTasks: 'Fetch Tasks',
  tasks_getTask: 'Fetch Task',
  tasks_createTask: 'Create Task',
  tasks_updateTask: 'Update Task',
  tasks_deleteTask: 'Delete Task',
  tasks_clearCompletedTasks: 'Clear Completed Tasks',
  tasks_moveTask: 'Move Task',
  drive_search: 'Searched Google Drive',
  gmail_search: 'Searched Gmail',
  gmail_get: 'Retrieved email',
  docs_create: 'Creating Google Doc',
  // Project tools
  project_read: 'Project Context',
  project_write: 'Update Project Context',
  project_log: 'Append to Changelog',
  project_log_tail: 'Recent Changelog Entries',
  project_log_search: 'Search Changelog',
  project_log_range: 'Changelog by Date Range',
};

/**
 * Humanize a tool name: tasks_listTaskLists -> "List Task Lists"
 * @param {string} name - Raw name like tasks_listTaskLists or tasks_listTaskLists_mcp_Google
 * @returns {string}
 */
function humanizeToolName(name) {
  if (!name || typeof name !== 'string') return 'Tool';
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Get friendly display name for a tool. Handles MCP tools (e.g. tasks_listTaskLists_mcp_Google).
 * @param {string} rawName - Tool name from content (e.g. tasks_listTaskLists_mcp_Google)
 * @returns {string} Friendly display name (e.g. "List Task Lists")
 */
function getToolDisplayName(rawName) {
  if (!rawName || typeof rawName !== 'string') return 'Tool';

  // Extract function name for MCP tools: tasks_listTaskLists_mcp_Google -> tasks_listTaskLists
  const mcpDelimiter = Constants.mcp_delimiter || '_mcp_';
  const functionName = rawName.includes(mcpDelimiter)
    ? rawName.split(mcpDelimiter)[0] || rawName
    : rawName;

  const exact = TOOL_DISPLAY_NAMES[functionName];
  if (exact) return exact;

  // tool_search_mcp_Google, tool_search_mcp_GitHub, etc. -> Discovery
  if (
    functionName === Constants.TOOL_SEARCH ||
    (typeof functionName === 'string' && functionName.startsWith('tool_search_mcp_'))
  ) {
    return TOOL_DISPLAY_NAMES[Constants.TOOL_SEARCH] || 'Discovery';
  }

  return humanizeToolName(functionName);
}

module.exports = {
  getToolDisplayName,
  humanizeToolName,
};
