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
  web_search: 'Web Search',
  run_sub_agent: 'Run Sub-Agent',
  list_agents: 'List Agents',
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
  send_user_email: 'Sent email',
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
  // Google Calendar MCP tools
  calendar_list: 'Listed calendars',
  calendar_listEvents: 'Listed events',
  calendar_createEvent: 'Created event',
  calendar_getEvent: 'Retrieved event',
  calendar_updateEvent: 'Updated event',
  calendar_deleteEvent: 'Deleted event',
  calendar_respondToEvent: 'Responded to event',
  calendar_findFreeTime: 'Found free time',
  // Microsoft To Do MCP tools
  'list-todo-tasks': 'Listed To Do tasks',
  'list-todo-task-lists': 'Listed To Do lists',
  'create-todo-task': 'Creating To Do task',
  'update-todo-task': 'Updating To Do task',
  'delete-todo-task': 'Deleting To Do task',
  // Microsoft 365 Calendar tools
  'list-calendar-events': 'Listed events',
  'get-calendar-view': 'Listed calendar view',
  'get-specific-calendar-view': 'Listed calendar view',
  'list-calendar-event-instances': 'Listed event instances',
  'list-specific-calendar-events': 'Listed events',
  'get-calendar-event': 'Retrieved event',
  'get-specific-calendar-event': 'Retrieved event',
  'create-calendar-event': 'Created event',
  'create-specific-calendar-event': 'Created event',
  'update-calendar-event': 'Updated event',
  'update-specific-calendar-event': 'Updated event',
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
  // CRM tools
  crm_list_pipelines: 'List Pipelines',
  crm_create_pipeline: 'Create Pipeline',
  crm_update_pipeline: 'Update Pipeline',
  crm_soft_delete_pipeline: 'Delete Pipeline',
  crm_create_contact: 'Create Contact',
  crm_update_contact: 'Update Contact',
  crm_get_contact: 'Get Contact',
  crm_list_contacts: 'List Contacts',
  crm_soft_delete_contact: 'Delete Contact',
  crm_create_organization: 'Create Organization',
  crm_get_organization: 'Get Organization',
  crm_list_organizations: 'List Organizations',
  crm_soft_delete_organization: 'Delete Organization',
  crm_create_deal: 'Create Deal',
  crm_update_deal: 'Update Deal',
  crm_list_deals: 'List Deals',
  crm_soft_delete_deal: 'Delete Deal',
  crm_log_activity: 'Log Activity',
  crm_list_activities: 'List Activities',
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
  // Sys Admin tools
  sys_admin_help: 'Sys Admin Help',
  sys_admin_search: 'Sys Admin Search',
  sys_admin_list_users: 'List Users',
  sys_admin_get_user: 'Get User',
  sys_admin_create_user: 'Create User',
  sys_admin_update_user: 'Update User',
  sys_admin_delete_user: 'Delete User',
  sys_admin_ban_user: 'Ban User',
  sys_admin_unban_user: 'Unban User',
  sys_admin_grant_agent_access: 'Grant Agent Access',
  sys_admin_revoke_agent_access: 'Revoke Agent Access',
  sys_admin_invite_user: 'Invite User',
  sys_admin_send_password_reset: 'Send Password Reset',
  sys_admin_list_workspaces: 'List Workspaces',
  sys_admin_get_workspace: 'Get Workspace',
  sys_admin_create_workspace: 'Create Workspace',
  sys_admin_update_workspace: 'Update Workspace',
  sys_admin_delete_workspace: 'Delete Workspace',
  sys_admin_list_workspace_members: 'List Workspace Members',
  sys_admin_invite_workspace_member: 'Invite Workspace Member',
  sys_admin_remove_workspace_member: 'Remove Workspace Member',
  sys_admin_get_user_usage: 'Get User Usage',
  sys_admin_get_user_balance: 'Get User Balance',
  sys_admin_list_usage: 'List Usage',
  sys_admin_usage_aggregate: 'Usage Aggregate',
  sys_admin_list_agents: 'List Agents',
  sys_admin_list_assignable_tools: 'List Assignable Tools',
  sys_admin_get_agent: 'Get Agent',
  sys_admin_create_agent: 'Create Agent',
  sys_admin_update_agent: 'Update Agent',
  sys_admin_delete_agent: 'Delete Agent',
  sys_admin_duplicate_agent: 'Duplicate Agent',
  sys_admin_list_agent_versions: 'List Agent Versions',
  sys_admin_revert_agent_version: 'Revert Agent Version',
  sys_admin_seed_system_agents: 'Seed System Agents',
  sys_admin_tail_logs: 'Tail Logs',
  sys_admin_search_event_logs: 'Search Event Logs',
  sys_admin_list_env: 'List Environment Variables',
  sys_admin_list_all_tools: 'List All Tools',
  sys_admin_create_tool_override: 'Create Tool Override',
  sys_admin_get_tool_override: 'Get Tool Override',
  sys_admin_update_tool_override: 'Update Tool Override',
  sys_admin_delete_tool_override: 'Delete Tool Override',
  sys_admin_list_tool_overrides: 'List Tool Overrides',
  sys_admin_list_feature_flags: 'List Feature Flags',
  sys_admin_set_feature_flag: 'Set Feature Flag',
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
