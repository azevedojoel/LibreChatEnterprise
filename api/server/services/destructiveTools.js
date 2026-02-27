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
