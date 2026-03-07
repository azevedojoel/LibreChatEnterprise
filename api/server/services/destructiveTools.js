/**
 * Destructive tools configuration - tools that require user confirmation before execution.
 * Extracted for testability (minimal dependencies).
 */
const { Tools, Constants } = require('librechat-data-provider');

/** Tools that require user confirmation before execution (destructive/mutating) */
const DESTRUCTIVE_TOOLS = new Set([
  Tools.execute_code,
  'code_interpreter',
  Tools.delete_schedule,
  Tools.create_schedule,
  Tools.update_schedule,
  Tools.run_schedule,
  Tools.run_sub_agent,
  Tools.project_create,
  Tools.crm_update_contact,
  Tools.crm_update_deal,
  Tools.crm_update_pipeline,
  Tools.crm_soft_delete_contact,
  Tools.crm_soft_delete_organization,
  Tools.crm_soft_delete_deal,
  Tools.crm_soft_delete_pipeline,
  // Google Workspace MCP (underscore notation)
  'gmail_send',
  'gmail_modify',
  'gmail_batchModify',
  'gmail_sendDraft',
  'calendar_createEvent',
  'calendar_updateEvent',
  'calendar_deleteEvent',
  'calendar_respondToEvent',
  'chat_sendMessage',
  'chat_sendDm',
  'chat_setUpSpace',
  'docs_create',
  'docs_insertText',
  'docs_appendText',
  'docs_replaceText',
  'docs_move',
  'drive_createFolder',
  'tasks_createTaskList',
  'tasks_updateTaskList',
  'tasks_deleteTaskList',
  'tasks_createTask',
  'tasks_updateTask',
  'tasks_deleteTask',
  'tasks_clearCompletedTasks',
  'auth_clear',
  // MS 365 MCP
  'send-mail',
  'delete-mail-message',
  'move-mail-message',
  'update-mail-message',
  'create-draft-email',
  'add-mail-attachment',
  'delete-mail-attachment',
  'forward-mail-message',
  'reply-mail-message',
  'reply-all-mail-message',
  'create-forward-draft',
  'create-reply-draft',
  'create-reply-all-draft',
  'send-draft-message',
  'move-mail-messages-many',
  'send-shared-mailbox-mail',
  'create-calendar-event',
  'update-calendar-event',
  'delete-calendar-event',
  'create-specific-calendar-event',
  'update-specific-calendar-event',
  'delete-specific-calendar-event',
  'delete-onedrive-file',
  'upload-file-content',
  'create-excel-chart',
  'format-excel-range',
  'sort-excel-range',
  'create-onenote-page',
  'create-onenote-section-page',
  'create-todo-task',
  'update-todo-task',
  'delete-todo-task',
  'create-outlook-contact',
  'update-outlook-contact',
  'delete-outlook-contact',
  'send-chat-message',
  'reply-to-chat-message',
  'send-channel-message',
  'reply-to-group-thread',
  Tools.add_productivity_account,
  Tools.remove_productivity_account,
  // Alex - blocks until target member approves
  Tools.human_await_response,
  // Sys Admin - mutating/destructive (require approval)
  Tools.sys_admin_create_user,
  Tools.sys_admin_update_user,
  Tools.sys_admin_delete_user,
  Tools.sys_admin_ban_user,
  Tools.sys_admin_unban_user,
  Tools.sys_admin_grant_agent_access,
  Tools.sys_admin_revoke_agent_access,
  Tools.sys_admin_invite_user,
  Tools.sys_admin_send_password_reset,
  Tools.sys_admin_create_workspace,
  Tools.sys_admin_update_workspace,
  Tools.sys_admin_delete_workspace,
  Tools.sys_admin_invite_workspace_member,
  Tools.sys_admin_remove_workspace_member,
  // Sys Admin - agent management (mutating)
  Tools.sys_admin_create_agent,
  Tools.sys_admin_update_agent,
  Tools.sys_admin_delete_agent,
  Tools.sys_admin_duplicate_agent,
  Tools.sys_admin_revert_agent_version,
  Tools.sys_admin_seed_system_agents,
  Tools.sys_admin_tail_logs,
  Tools.sys_admin_search_event_logs,
  Tools.sys_admin_list_env,
  Tools.sys_admin_create_tool_override,
  Tools.sys_admin_update_tool_override,
  Tools.sys_admin_delete_tool_override,
  Tools.sys_admin_set_feature_flag,
]);

/**
 * Checks if a tool requires user confirmation before execution.
 * For MCP tools (name contains _mcp_), matches on the function part (before _mcp_serverName).
 */
const isDestructiveTool = (toolName) => {
  if (!toolName || typeof toolName !== 'string') return false;
  const mcpDelimiter = Constants.mcp_delimiter || '_mcp_';
  const baseName = toolName.includes(mcpDelimiter) ? toolName.split(mcpDelimiter)[0] : toolName;
  return DESTRUCTIVE_TOOLS.has(baseName);
};

module.exports = { isDestructiveTool, DESTRUCTIVE_TOOLS };
