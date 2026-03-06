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
  workspace_pull_file: 'Pull File to Workspace',
  list_my_files: 'List My Files',
  create_pdf: 'Create Document',
  run_tool_and_save: 'Export to File',
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
  drive_createFolder: 'Created folder',
  drive_findFolder: 'Found folder',
  drive_downloadFile: 'Downloaded to My Files',
  gmail_search: 'Searched Gmail',
  gmail_get: 'Retrieved email',
  gmail_send: 'Sent email',
  gmail_sendDraft: 'Sent draft',
  gmail_createDraft: 'Created draft',
  gmail_downloadAttachment: 'Downloaded attachment',
  gmail_modify: 'Modified email labels',
  gmail_batchModify: 'Batch modified emails',
  gmail_listLabels: 'Listed Gmail labels',
  gmail_createLabel: 'Created Gmail label',
  docs_create: 'Creating Google Doc',
  docs_insertText: 'Inserted text in Doc',
  docs_find: 'Searched Google Docs',
  docs_move: 'Moved Doc',
  docs_getText: 'Retrieved Doc content',
  docs_appendText: 'Appended text to Doc',
  docs_replaceText: 'Replaced text in Doc',
  docs_extractIdFromUrl: 'Extracted Doc ID',
  slides_getText: 'Retrieved Slides content',
  slides_find: 'Searched Google Slides',
  slides_getMetadata: 'Retrieved Slides metadata',
  slides_getImages: 'Downloaded Slides images',
  slides_getSlideThumbnail: 'Downloaded slide thumbnail',
  sheets_getText: 'Retrieved Sheets content',
  sheets_getRange: 'Retrieved Sheets range',
  sheets_find: 'Searched Google Sheets',
  sheets_getMetadata: 'Retrieved Sheets metadata',
  auth_clear: 'Cleared authentication',
  auth_refreshToken: 'Refreshed token',
  time_getCurrentDate: 'Retrieved current date',
  time_getCurrentTime: 'Retrieved current time',
  time_getTimeZone: 'Retrieved timezone',
  people_getUserProfile: 'Retrieved user profile',
  people_getMe: 'Retrieved my profile',
  people_getUserRelations: 'Retrieved user relations',
  // Project tools
  project_section_update: 'Update Project Section',
  project_section_delete: 'Delete Project Section',
  project_section_patch: 'Batch Update Project Sections',
  project_log: 'Append to Changelog',
  project_log_tail: 'Recent Changelog Entries',
  project_log_search: 'Search Changelog',
  project_log_range: 'Changelog by Date Range',
  project_create: 'Create Project',
  project_list: 'List Projects',
  project_archive: 'Archive Project',
  project_update_metadata: 'Update Project Metadata',
  project_switch: 'Switch to Project',
  // Coder tools
  generate_code: 'Generate Code',
  install_dependencies: 'Install Dependencies',
  lint: 'Lint',
  run_program: 'Run Program',
  workspace_status: 'Workspace Status',
  workspace_init: 'Workspace Init',
  reset_workspace: 'Reset Workspace',
  update_todo: 'Update Todo',
  create_plan: 'Create Plan',
  create_brainstorm_doc: 'Brainstorm Doc',
  // Human tools
  human_list_workspace_members: 'List Workspace Members',
  human_routing_rules_list: 'List Routing Rules',
  human_routing_rules_set: 'Set Routing Rule',
  human_routing_rules_delete: 'Delete Routing Rule',
  human_notify_human: 'Notify Team Member',
  human_await_response: 'Request Approval',
  human_invite_to_workspace: 'Invite to Workspace',
  human_remove_from_workspace: 'Remove from Workspace',
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
