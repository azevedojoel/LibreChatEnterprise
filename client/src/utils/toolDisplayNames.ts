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
  [Tools.workspace_pull_file]: 'Pull File to Workspace',
  [Tools.list_my_files]: 'List My Files',
  [Tools.create_pdf]: 'Create Document',
  [Tools.run_tool_and_save]: 'Export to File',
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
  drive_createFolder: 'Created folder',
  gmail_search: 'Searched Gmail',
  gmail_get: 'Retrieved email',
  gmail_send: 'Sent email',
  gmail_sendDraft: 'Sent draft',
  send_user_email: 'Sent email',
  // Sys Admin tools
  sys_admin_help: 'Sys Admin Help',
  sys_admin_list_users: 'List Users',
  sys_admin_get_user: 'Get User',
  sys_admin_create_user: 'Create User',
  sys_admin_update_user: 'Update User',
  sys_admin_delete_user: 'Delete User',
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
  sys_admin_tail_logs: 'Tail Logs',
  sys_admin_list_env: 'List Environment Variables',
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
  // Google Slides
  slides_getText: 'Retrieved Slides content',
  slides_find: 'Searched Google Slides',
  slides_getMetadata: 'Retrieved Slides metadata',
  slides_getImages: 'Downloaded Slides images',
  slides_getSlideThumbnail: 'Downloaded slide thumbnail',
  // Google Sheets
  sheets_getText: 'Retrieved Sheets content',
  sheets_getRange: 'Retrieved Sheets range',
  sheets_find: 'Searched Google Sheets',
  sheets_getMetadata: 'Retrieved Sheets metadata',
  // Google Drive (additional)
  drive_findFolder: 'Found folder',
  drive_downloadFile: 'Downloaded to My Files',
  // Google Auth
  auth_clear: 'Cleared authentication',
  auth_refreshToken: 'Refreshed token',
  // Google Time
  time_getCurrentDate: 'Retrieved current date',
  time_getCurrentTime: 'Retrieved current time',
  time_getTimeZone: 'Retrieved timezone',
  // Google People
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
  // Microsoft To Do MCP tools (hyphen notation)
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
  // Scheduler tools
  [Tools.list_schedules]: 'List Schedules',
  [Tools.list_user_projects]: 'List Projects',
  [Tools.create_schedule]: 'Create Schedule',
  [Tools.update_schedule]: 'Update Schedule',
  [Tools.delete_schedule]: 'Delete Schedule',
  [Tools.run_schedule]: 'Run Schedule Now',
  [Tools.list_runs]: 'List Run History',
  [Tools.get_run]: 'Get Run Details',
  // Coder tools
  [Tools.generate_code]: 'Generate Code',
  [Tools.install_dependencies]: 'Install Dependencies',
  [Tools.lint]: 'Lint',
  [Tools.run_program]: 'Run Program',
  [Tools.workspace_status]: 'Workspace Status',
  [Tools.workspace_init]: 'Workspace Init',
  [Tools.reset_workspace]: 'Reset Workspace',
  [Tools.update_todo]: 'Update Todo',
  [Tools.create_plan]: 'Create Plan',
  [Tools.create_brainstorm_doc]: 'Brainstorm Doc',
  // Human tools
  [Tools.human_list_workspace_members]: 'List Workspace Members',
  [Tools.human_routing_rules_list]: 'List Routing Rules',
  [Tools.human_routing_rules_set]: 'Set Routing Rule',
  [Tools.human_routing_rules_delete]: 'Delete Routing Rule',
  [Tools.human_notify_human]: 'Notify Team Member',
  [Tools.human_await_response]: 'Request Approval',
  [Tools.human_invite_to_workspace]: 'Invite to Workspace',
  [Tools.human_remove_from_workspace]: 'Remove from Workspace',
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
