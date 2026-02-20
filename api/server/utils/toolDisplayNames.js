/**
 * Server-side tool display names for email formatting.
 * Mirrors client TOOL_DISPLAY_NAMES in ToolCall.tsx for consistency.
 */
const { Constants } = require('librechat-data-provider');

const TOOL_DISPLAY_NAMES = {
  search_user_files: 'Grepped',
  workspace_glob_files: 'Globbed',
  [Constants.TOOL_SEARCH]: 'Discovery',
  // Google Tasks tools (underscore: default, dot: --use-dot-names)
  tasks_listTaskLists: 'Listing Google Task Lists',
  'tasks.listTaskLists': 'Listing Google Task Lists',
  tasks_getTaskList: 'Getting Google Task List',
  'tasks.getTaskList': 'Getting Google Task List',
  tasks_createTaskList: 'Creating Google Task List',
  'tasks.createTaskList': 'Creating Google Task List',
  tasks_updateTaskList: 'Updating Google Task List',
  'tasks.updateTaskList': 'Updating Google Task List',
  tasks_deleteTaskList: 'Deleting Google Task List',
  'tasks.deleteTaskList': 'Deleting Google Task List',
  tasks_listTasks: 'Listing Google Tasks',
  'tasks.listTasks': 'Listing Google Tasks',
  tasks_getTask: 'Getting Google Task',
  'tasks.getTask': 'Getting Google Task',
  tasks_createTask: 'Creating Google Task',
  'tasks.createTask': 'Creating Google Task',
  tasks_updateTask: 'Updating Google Task',
  'tasks.updateTask': 'Updating Google Task',
  tasks_deleteTask: 'Deleting Google Task',
  'tasks.deleteTask': 'Deleting Google Task',
  tasks_clearCompletedTasks: 'Clearing Completed Google Tasks',
  'tasks.clearCompletedTasks': 'Clearing Completed Google Tasks',
  tasks_moveTask: 'Moving Google Task',
  'tasks.moveTask': 'Moving Google Task',
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
