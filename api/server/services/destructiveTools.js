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
  Tools.crm_create_contact,
  Tools.crm_update_contact,
  Tools.crm_create_organization,
  Tools.crm_create_deal,
  Tools.crm_update_deal,
  Tools.crm_log_activity,
  Tools.crm_create_pipeline,
  Tools.crm_update_pipeline,
  Tools.crm_soft_delete_contact,
  Tools.crm_soft_delete_organization,
  Tools.crm_soft_delete_deal,
  Tools.crm_soft_delete_pipeline,
  // Google Workspace MCP (dot and underscore variants - server config may use either)
  'gmail.send',
  'gmail_send',
  'gmail.modify',
  'gmail_modify',
  'gmail.createDraft',
  'gmail_create_draft',
  'gmail.sendDraft',
  'gmail_send_draft',
  'gmail.createLabel',
  'gmail_create_label',
  'calendar.createEvent',
  'calendar_create_event',
  'calendar.updateEvent',
  'calendar_update_event',
  'calendar.deleteEvent',
  'calendar_delete_event',
  'calendar.respondToEvent',
  'calendar_respond_to_event',
  'chat.sendMessage',
  'chat_send_message',
  'chat.sendDm',
  'chat_send_dm',
  'chat.setUpSpace',
  'chat_set_up_space',
  'docs.create',
  'docs_create',
  'docs.insertText',
  'docs_insert_text',
  'docs.appendText',
  'docs_append_text',
  'docs.replaceText',
  'docs_replace_text',
  'docs.move',
  'docs_move',
  'drive.createFolder',
  'drive_create_folder',
  'tasks.createTaskList',
  'tasks_create_task_list',
  'tasks.updateTaskList',
  'tasks_update_task_list',
  'tasks.deleteTaskList',
  'tasks_delete_task_list',
  'tasks.createTask',
  'tasks_create_task',
  'tasks.updateTask',
  'tasks_update_task',
  'tasks.deleteTask',
  'tasks_delete_task',
  'tasks.clearCompletedTasks',
  'tasks_clear_completed_tasks',
  'auth.clear',
  'auth_clear',
  // MS 365 MCP
  'send-mail',
  'delete-mail-message',
]);

/**
 * Checks if a tool requires user confirmation before execution.
 * For MCP tools (name contains _mcp_), matches on the function part (before _mcp_serverName).
 */
const isDestructiveTool = (toolName) => {
  if (!toolName || typeof toolName !== 'string') return false;
  const mcpDelimiter = Constants.mcp_delimiter || '_mcp_';
  const baseName = toolName.includes(mcpDelimiter)
    ? toolName.split(mcpDelimiter)[0]
    : toolName;
  return DESTRUCTIVE_TOOLS.has(baseName);
};

module.exports = { isDestructiveTool, DESTRUCTIVE_TOOLS };
