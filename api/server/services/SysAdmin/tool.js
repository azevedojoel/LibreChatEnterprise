/**
 * LangChain tools for Sys Admin capability.
 * Admin-only tools for user management, workspace management, token usage, and agent management.
 * Used when an agent has the sys_admin capability and the user has ADMIN role.
 */
const fs = require('fs').promises;
const path = require('path');
const { tool } = require('@langchain/core/tools');
const {
  Tools,
  SystemRoles,
  Constants,
  ResourceType,
  PrincipalType,
  AccessRoleIds,
  removeNullishValues,
  EToolResources,
  actionDelimiter,
  AgentCapabilities,
} = require('librechat-data-provider');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { nanoid } = require('nanoid');
const { logger } = require('@librechat/data-schemas');
const {
  findUser,
  createUser: createUserModel,
  getUserById,
  deleteUserById,
  createToken,
  deleteTokens,
  deleteAllUserSessions,
} = require('~/models');
const { createInvite } = require('~/models/inviteUser');
const {
  listWorkspaces,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  getWorkspaceById,
} = require('~/models/Workspace');
const {
  inviteUserToWorkspace,
  INVITE_ERROR_CODES,
} = require('~/server/services/WorkspaceInvite/inviteUser');
const { getAppConfig, getCachedTools } = require('~/server/services/Config');
const {
  checkEmailConfig,
  agentCreateSchema,
  agentUpdateSchema,
  getToolDefinition,
  getAllToolDefinitions,
} = require('@librechat/api');
const {
  getOverride,
  listOverrides,
  createOverride,
  getOverrideById,
  updateOverride,
  deleteOverride,
} = require('~/server/services/ToolOverrideService');
const { searchToolsByQuery, formatToolSearchForDiscovery } = require('@librechat/agents');
const {
  getEffectiveFeatureFlags,
  setFeatureFlag,
  getAllowedKeys,
} = require('~/server/services/FeatureFlagService');
const { sendEmail } = require('~/server/utils');
const { Transaction, Balance } = require('~/db/models');
const { getTransactions } = require('~/models/Transaction');
const {
  createAgent,
  getAgent,
  updateAgent,
  deleteAgent,
  revertAgentVersion,
} = require('~/models/Agent');
const { getActions, updateAction } = require('~/models/Action');
const {
  grantPermission,
  bulkUpdateResourcePermissions,
} = require('~/server/services/PermissionService');
const { seedSystemAgents } = require('~/server/services/seedSystemAgents');
const { manifestToolMap } = require('~/app/clients/tools/manifest');
const { getLogStores } = require('~/cache');
const { ViolationTypes } = require('librechat-data-provider');
const { searchEventLogs } = require('~/server/services/EventLogService');

const EXCLUDED_FIELDS = '-password -totpSecret -refreshToken -__v';

/** Resolve log directory (inline equivalent of getLogDirectory from data-schemas) */
function getLogDirectory() {
  if (process.env.LIBRECHAT_LOG_DIR) {
    return process.env.LIBRECHAT_LOG_DIR;
  }
  const cwd = process.cwd();
  if (cwd.endsWith('/api') || cwd.endsWith('\\api')) {
    return path.join(cwd, 'logs');
  }
  if (cwd.includes('LibreChat')) {
    return path.join(cwd, 'api', 'logs');
  }
  return path.join(cwd, 'logs');
}

/** Redact env value if key matches sensitive patterns */
const SENSITIVE_KEY_REGEX = /password|secret|key|token|credential|auth|uri|mongo/i;
function isSensitiveKey(key) {
  return SENSITIVE_KEY_REGEX.test(key);
}

/** Resolve user by userId or email; returns { _id, id } or null */
async function resolveUserForBan(userId, email) {
  if (userId) {
    const user = await getUserById(userId, '_id');
    return user ? { _id: user._id, id: user._id?.toString() } : null;
  }
  if (email && String(email).trim().includes('@')) {
    const user = await findUser({ email: String(email).trim().toLowerCase() }, '_id');
    return user ? { _id: user._id, id: user._id?.toString() } : null;
  }
  return null;
}

const CAPABILITY_DESCRIPTIONS = {
  [AgentCapabilities.hide_sequential_outputs]: 'Hide intermediate tool outputs',
  [AgentCapabilities.programmatic_tools]: 'Programmatic tool calling from code',
  [AgentCapabilities.end_after_tools]: 'End response after tool execution',
  [AgentCapabilities.deferred_tools]: 'Defer loading of tools until needed',
  [AgentCapabilities.execute_code]: 'Run code in a sandbox',
  [AgentCapabilities.file_search]: 'Search uploaded files',
  [AgentCapabilities.web_search]: 'Search the web',
  [AgentCapabilities.artifacts]: 'Create and display artifacts',
  [AgentCapabilities.actions]: 'Custom actions and API calls',
  [AgentCapabilities.context]: 'Context from files',
  [AgentCapabilities.tools]: 'General tool access',
  [AgentCapabilities.chain]: 'Chain to other agents',
  [AgentCapabilities.ocr]: 'OCR from images',
  [AgentCapabilities.create_pdf]: 'Create documents',
  [AgentCapabilities.manage_scheduling]: 'Manage scheduled agent runs',
  [AgentCapabilities.human_in_the_loop]: 'Human approval and handoff',
  [AgentCapabilities.inbound_email]: 'Receive email',
  [AgentCapabilities.sys_admin]: 'Sys Admin tools (admin only)',
};

const createTokenHash = () => {
  const token = require('node:crypto').randomBytes(32).toString('hex');
  const hash = bcrypt.hashSync(token, 10);
  return [token, hash];
};

const toJson = (obj) => (typeof obj === 'string' ? obj : JSON.stringify(obj ?? null));

/**
 * @param {Object} params
 * @param {string} params.userId - Admin user ID
 * @param {string} params.userRole - Admin user role (must be ADMIN)
 * @returns {Record<string, import('@langchain/core/tools').StructuredTool>}
 */
function createSysAdminTools({ userId, userRole }) {
  const requireAdmin = () => {
    if (userRole !== SystemRoles.ADMIN) {
      return { error: 'Sys Admin tools require ADMIN role.' };
    }
    return null;
  };

  const helpTool = tool(
    async () => {
      const err = requireAdmin();
      if (err) return toJson(err);
      return toJson({
        description:
          'Sys Admin tools for site administration. You can manage users, workspaces, agents, and query token usage.',
        tools: [
          {
            name: 'sys_admin_help',
            purpose: 'Get this help and example questions',
          },
          {
            name: 'sys_admin_search',
            purpose:
              'Search sys_admin tools by query (e.g. "ban user", "logs", "feature flag") - use to discover the right tool',
          },
          {
            name: 'sys_admin_list_users',
            purpose: 'List users (search by email, name, username)',
          },
          {
            name: 'sys_admin_get_user',
            purpose: 'Get user details by ID',
          },
          {
            name: 'sys_admin_create_user',
            purpose: 'Create a new user',
          },
          {
            name: 'sys_admin_update_user',
            purpose: 'Update user (name, role, workspace, etc.)',
          },
          {
            name: 'sys_admin_delete_user',
            purpose: 'Delete a user',
          },
          {
            name: 'sys_admin_ban_user',
            purpose: 'Ban a user (revoke sessions, block access)',
          },
          {
            name: 'sys_admin_unban_user',
            purpose: 'Remove a user ban',
          },
          {
            name: 'sys_admin_grant_agent_access',
            purpose: 'Grant a user access to an agent (viewer/editor/owner)',
          },
          {
            name: 'sys_admin_revoke_agent_access',
            purpose: "Revoke a user's access to an agent",
          },
          {
            name: 'sys_admin_invite_user',
            purpose: 'Invite user by email',
          },
          {
            name: 'sys_admin_send_password_reset',
            purpose: 'Send password reset email to user',
          },
          {
            name: 'sys_admin_list_workspaces',
            purpose: 'List all workspaces',
          },
          {
            name: 'sys_admin_get_workspace',
            purpose: 'Get workspace by ID',
          },
          {
            name: 'sys_admin_create_workspace',
            purpose: 'Create a workspace',
          },
          {
            name: 'sys_admin_update_workspace',
            purpose: 'Update workspace',
          },
          {
            name: 'sys_admin_delete_workspace',
            purpose: 'Delete a workspace',
          },
          {
            name: 'sys_admin_list_workspace_members',
            purpose: 'List workspace members',
          },
          {
            name: 'sys_admin_invite_workspace_member',
            purpose: 'Invite user to workspace',
          },
          {
            name: 'sys_admin_remove_workspace_member',
            purpose: 'Remove member from workspace',
          },
          {
            name: 'sys_admin_get_user_usage',
            purpose: 'Get token usage for a user',
          },
          {
            name: 'sys_admin_get_user_balance',
            purpose: "Get user's token balance",
          },
          {
            name: 'sys_admin_list_usage',
            purpose: 'List transactions with filters',
          },
          {
            name: 'sys_admin_usage_aggregate',
            purpose: 'Aggregate usage by user',
          },
          {
            name: 'sys_admin_list_agents',
            purpose: 'List all agents (search, pagination)',
          },
          {
            name: 'sys_admin_list_assignable_tools',
            purpose: 'List capabilities and tools for agent assignment',
          },
          {
            name: 'sys_admin_get_agent',
            purpose: 'Get full agent details by ID',
          },
          {
            name: 'sys_admin_create_agent',
            purpose: 'Create a new agent',
          },
          {
            name: 'sys_admin_update_agent',
            purpose: 'Update an agent',
          },
          {
            name: 'sys_admin_delete_agent',
            purpose: 'Delete an agent',
          },
          {
            name: 'sys_admin_duplicate_agent',
            purpose: 'Duplicate an agent',
          },
          {
            name: 'sys_admin_list_agent_versions',
            purpose: 'List version history (use before revert to pick version)',
          },
          {
            name: 'sys_admin_revert_agent_version',
            purpose: 'Revert agent to a version (versionIndex or -1 for previous)',
          },
          {
            name: 'sys_admin_seed_system_agents',
            purpose: 'Seed system agents from config',
          },
          {
            name: 'sys_admin_tail_logs',
            purpose: 'Read recent server log entries (error/debug)',
          },
          {
            name: 'sys_admin_search_event_logs',
            purpose: 'Search audit event logs (emails sent, by conversation/schedule/user)',
          },
          {
            name: 'sys_admin_list_env',
            purpose: 'List environment variable names (sensitive values redacted)',
          },
          {
            name: 'sys_admin_list_all_tools',
            purpose: 'List all tools with descriptions and schemas',
          },
          {
            name: 'sys_admin_create_tool_override',
            purpose:
              'Create tool override (description, schema, or requiresApproval). Optional agentId (per-agent), userId (per-user). requiresApproval: true=gate, false=ungate.',
          },
          {
            name: 'sys_admin_get_tool_override',
            purpose: 'Get a tool override by id or toolId+agentId+userId',
          },
          {
            name: 'sys_admin_update_tool_override',
            purpose: 'Update a tool override (description, schema, requiresApproval)',
          },
          {
            name: 'sys_admin_delete_tool_override',
            purpose: 'Delete a tool override by id or toolId+agentId+userId',
          },
          {
            name: 'sys_admin_list_tool_overrides',
            purpose:
              'List tool overrides with filters (toolId, agentId, userId). Returns requiresApproval.',
          },
          {
            name: 'sys_admin_list_feature_flags',
            purpose: 'List feature flags (summarizeEnabled, feedbackEnabled, balanceEnabled, etc.)',
          },
          {
            name: 'sys_admin_set_feature_flag',
            purpose: 'Set a feature flag (changes apply immediately)',
          },
        ],
        exampleQuestions: [
          'What tools can I use to ban a user? (use sys_admin_search)',
          'How much token usage does user X have?',
          "What is user X's current balance?",
          'List all users',
          'Search users by email',
          'Create a new user with email X',
          'Ban user X for 60 minutes',
          'Unban user X',
          'Grant user X access to agent Y',
          "Revoke user X's access to agent Y",
          'Invite user X to workspace Y',
          'What workspaces exist?',
          'Add user X to workspace Y',
          'List all agents',
          'What tools can I assign to an agent?',
          'Create a new agent',
          'Duplicate agent X',
          'List versions of agent X',
          'Revert agent X to previous version',
          'Seed system agents from config',
          'What errors are in the logs?',
          'Show recent errors from today',
          'Find emails sent to user@example.com',
          'Show events for schedule X',
          'Find failed email sends',
          'Events for conversation X',
          'List env vars starting with OPENAI',
          'List all tools with descriptions',
          'Create a tool override for file_search',
          'Ungate execute_code for agent X (no approval required)',
          'Gate file_search for user X (require approval)',
          'List tool overrides for agent X',
          'List feature flags',
          'Enable or disable summarization',
        ],
      });
    },
    {
      name: Tools.sys_admin_help,
      description:
        'Returns description of all sys_admin tools and example questions. Use when the user asks what you can do or about token usage.',
      schema: { type: 'object', properties: {}, required: [] },
    },
  );

  const searchTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      try {
        const allDefs = getAllToolDefinitions();
        const sysAdminDefs = allDefs.filter(
          (d) => d.name?.startsWith?.('sys_admin_') && d.name !== 'sys_admin_search',
        );
        const tools = sysAdminDefs.map((d) => ({
          name: d.name,
          description: d.description ?? '',
          parameters: d.schema,
        }));

        const { query = '', max_results = 10 } = rawInput || {};
        const response = searchToolsByQuery(tools, String(query || '').trim(), {
          maxResults: Math.min(20, Math.max(1, parseInt(max_results, 10) || 10)),
        });
        return formatToolSearchForDiscovery(response, true);
      } catch (e) {
        logger.error('[SysAdmin] sys_admin_search error:', e);
        return toJson({ error: e?.message ?? 'Search failed' });
      }
    },
    {
      name: Tools.sys_admin_search,
      description:
        'Searches sys_admin tools by query using BM25 ranking. Use to discover which tool to use for a task (e.g. "ban user", "token usage", "read logs").',
      schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Search term to find in tool names and descriptions (e.g. "ban user", "logs", "feature flag")',
          },
          max_results: {
            type: 'integer',
            minimum: 1,
            maximum: 20,
            default: 10,
            description: 'Maximum number of matching tools to return (default 10)',
          },
        },
        required: [],
      },
    },
  );

  const listUsersTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      try {
        const User = require('~/db/models').User;
        const { search = '', limit = 50, page = 1 } = rawInput || {};

        const filter = {};
        if (search && String(search).trim()) {
          const regex = new RegExp(
            String(search)
              .trim()
              .replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            'i',
          );
          filter.$or = [
            { email: regex },
            { name: regex },
            { username: regex },
            { inboundEmailToken: regex },
          ];
        }

        const skip =
          (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, parseInt(limit, 10) || 50);
        const limitNum = Math.min(100, parseInt(limit, 10) || 50);

        const users = await User.find(filter, EXCLUDED_FIELDS)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean();

        const total = await User.countDocuments(filter);
        const sanitized = users.map((u) => ({
          _id: u._id?.toString(),
          id: u._id?.toString(),
          ...u,
        }));

        return toJson({
          users: sanitized,
          total,
          page: Math.floor(skip / limitNum) + 1,
          limit: limitNum,
        });
      } catch (e) {
        logger.error('[SysAdmin.listUsers]', e);
        return toJson({ error: e.message || 'Failed to list users' });
      }
    },
    {
      name: Tools.sys_admin_list_users,
      description: 'List users with optional search and pagination. Optional: search, limit, page.',
      schema: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          limit: { type: 'number' },
          page: { type: 'number' },
        },
        required: [],
      },
    },
  );

  const getUserTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { userId: targetUserId } = rawInput || {};
      if (!targetUserId) return toJson({ error: 'userId is required' });
      try {
        const user = await getUserById(targetUserId, EXCLUDED_FIELDS);
        if (!user) return toJson({ error: 'User not found' });
        const { _id, ...rest } = user;
        return toJson({ _id: _id?.toString(), id: _id?.toString(), ...rest });
      } catch (e) {
        logger.error('[SysAdmin.getUser]', e);
        return toJson({ error: e.message || 'Failed to get user' });
      }
    },
    {
      name: Tools.sys_admin_get_user,
      description: 'Get a user by ID. Required: userId.',
      schema: {
        type: 'object',
        properties: { userId: { type: 'string' } },
        required: ['userId'],
      },
    },
  );

  const createUserTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { email, password, name, username, role, workspace_id, inboundEmailToken } =
        rawInput || {};
      if (!email || !String(email).trim()) return toJson({ error: 'email is required' });
      try {
        const appConfig = await getAppConfig();
        const normalizedEmail = String(email).trim().toLowerCase();
        const existingUser = await findUser({ email: normalizedEmail }, 'email _id');
        if (existingUser) return toJson({ error: 'User with this email already exists' });

        const hashedPassword = password?.trim()
          ? bcrypt.hashSync(password.trim(), bcrypt.genSaltSync(10))
          : undefined;

        const tokenValue =
          typeof inboundEmailToken === 'string' && inboundEmailToken.trim()
            ? inboundEmailToken.trim()
            : undefined;

        if (tokenValue) {
          const existingTokenUser = await findUser({ inboundEmailToken: tokenValue }, '_id');
          if (existingTokenUser) {
            return toJson({ error: 'Another user already has this inbound email token' });
          }
        }

        let workspaceIdObj = null;
        if (workspace_id != null && workspace_id !== '') {
          if (!mongoose.Types.ObjectId.isValid(workspace_id)) {
            return toJson({ error: 'Invalid workspace ID' });
          }
          workspaceIdObj = new mongoose.Types.ObjectId(workspace_id);
        }

        const newUserData = {
          provider: 'local',
          email: normalizedEmail,
          username: username?.trim() || undefined,
          name: name?.trim() || undefined,
          role: role === SystemRoles.ADMIN ? SystemRoles.ADMIN : SystemRoles.USER,
          emailVerified: true,
          ...(hashedPassword && { password: hashedPassword }),
          ...(tokenValue && { inboundEmailToken: tokenValue }),
          ...(workspaceIdObj && { workspace_id: workspaceIdObj }),
        };

        const result = await createUserModel(newUserData, appConfig?.balance, true, true);
        const newUser =
          typeof result === 'object'
            ? result
            : await getUserById(result?.toString() ?? result, EXCLUDED_FIELDS);

        if (!newUser) return toJson({ error: 'Failed to create user' });
        const { _id, ...rest } = newUser;
        return toJson({ _id: _id?.toString(), id: _id?.toString(), ...rest });
      } catch (e) {
        logger.error('[SysAdmin.createUser]', e);
        return toJson({ error: e.message || 'Failed to create user' });
      }
    },
    {
      name: Tools.sys_admin_create_user,
      description:
        'Create a new user. Required: email. Optional: password, name, username, role, workspace_id.',
      schema: {
        type: 'object',
        properties: {
          email: { type: 'string' },
          password: { type: 'string' },
          name: { type: 'string' },
          username: { type: 'string' },
          role: { type: 'string', enum: ['ADMIN', 'USER'] },
          workspace_id: { type: 'string' },
          inboundEmailToken: { type: 'string' },
        },
        required: ['email'],
      },
    },
  );

  const updateUserTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const {
        userId: targetUserId,
        name,
        username,
        email,
        role,
        password,
        workspace_id,
        inboundEmailToken,
      } = rawInput || {};
      if (!targetUserId) return toJson({ error: 'userId is required' });
      try {
        const existingUser = await getUserById(targetUserId);
        if (!existingUser) return toJson({ error: 'User not found' });

        const updateData = {};
        const unsetData = {};

        if (name !== undefined) updateData.name = name?.trim() || '';
        if (username !== undefined) updateData.username = username?.trim() || '';
        if (email !== undefined && email?.trim()) {
          const normalizedEmail = email.trim().toLowerCase();
          const otherUser = await findUser(
            { email: normalizedEmail, _id: { $ne: targetUserId } },
            '_id',
          );
          if (otherUser) return toJson({ error: 'Another user with this email already exists' });
          updateData.email = normalizedEmail;
        }
        if (role !== undefined)
          updateData.role = role === SystemRoles.ADMIN ? SystemRoles.ADMIN : SystemRoles.USER;
        if (password !== undefined && password?.trim()) {
          updateData.password = bcrypt.hashSync(password.trim(), bcrypt.genSaltSync(10));
        }
        if (inboundEmailToken !== undefined) {
          const tokenValue =
            typeof inboundEmailToken === 'string' && inboundEmailToken.trim()
              ? inboundEmailToken.trim()
              : null;
          if (tokenValue) {
            const existingTokenUser = await findUser(
              { inboundEmailToken: tokenValue, _id: { $ne: targetUserId } },
              '_id',
            );
            if (existingTokenUser) {
              return toJson({ error: 'Another user already has this inbound email token' });
            }
            updateData.inboundEmailToken = tokenValue;
          } else {
            unsetData.inboundEmailToken = '';
          }
        }
        if (workspace_id !== undefined) {
          if (workspace_id === null || workspace_id === '') {
            unsetData.workspace_id = '';
          } else {
            if (!mongoose.Types.ObjectId.isValid(workspace_id)) {
              return toJson({ error: 'Invalid workspace ID' });
            }
            updateData.workspace_id = new mongoose.Types.ObjectId(workspace_id);
          }
        }

        if (Object.keys(updateData).length === 0 && Object.keys(unsetData).length === 0) {
          const { _id, password: _p, totpSecret: _t, ...rest } = existingUser;
          return toJson({ _id, id: _id?.toString(), ...rest });
        }

        const User = require('~/db/models').User;
        const updateOp = {};
        if (Object.keys(updateData).length > 0) updateOp.$set = updateData;
        if (Object.keys(unsetData).length > 0) updateOp.$unset = unsetData;

        const updated = await User.findByIdAndUpdate(targetUserId, updateOp, {
          new: true,
          runValidators: true,
        })
          .select(EXCLUDED_FIELDS)
          .lean();

        if (!updated) return toJson({ error: 'Failed to update user' });
        const { _id, password: _p, totpSecret: _t, ...rest } = updated;
        return toJson({ _id, id: _id?.toString(), ...rest });
      } catch (e) {
        logger.error('[SysAdmin.updateUser]', e);
        return toJson({ error: e.message || 'Failed to update user' });
      }
    },
    {
      name: Tools.sys_admin_update_user,
      description:
        'Update a user. Required: userId. Optional: name, username, email, role, password, workspace_id.',
      schema: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          name: { type: 'string' },
          username: { type: 'string' },
          email: { type: 'string' },
          role: { type: 'string', enum: ['ADMIN', 'USER'] },
          password: { type: 'string' },
          workspace_id: { type: 'string' },
          inboundEmailToken: { type: 'string' },
        },
        required: ['userId'],
      },
    },
  );

  const deleteUserTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { userId: targetUserId } = rawInput || {};
      if (!targetUserId) return toJson({ error: 'userId is required' });
      if (userId === targetUserId) return toJson({ error: 'You cannot delete your own account' });
      try {
        const result = await deleteUserById(targetUserId);
        if (result.deletedCount === 0) return toJson({ error: 'User not found' });
        return toJson({ message: 'User deleted successfully' });
      } catch (e) {
        logger.error('[SysAdmin.deleteUser]', e);
        return toJson({ error: e.message || 'Failed to delete user' });
      }
    },
    {
      name: Tools.sys_admin_delete_user,
      description: 'Delete a user. Required: userId. Cannot delete yourself.',
      schema: {
        type: 'object',
        properties: { userId: { type: 'string' } },
        required: ['userId'],
      },
    },
  );

  const banUserTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { userId: inputUserId, email: inputEmail, durationMinutes = 60 } = rawInput || {};
      if (!inputUserId && !inputEmail) return toJson({ error: 'userId or email is required' });
      try {
        const resolved = await resolveUserForBan(inputUserId, inputEmail);
        if (!resolved) return toJson({ error: 'User not found' });
        const targetUserId = resolved.id;
        if (targetUserId === userId) return toJson({ error: 'Cannot ban yourself' });

        await deleteAllUserSessions({ userId: targetUserId });

        const banLogs = getLogStores(ViolationTypes.BAN);
        const durationMs =
          durationMinutes <= 0
            ? 100 * 365 * 24 * 60 * 60 * 1000
            : Math.min(durationMinutes, 525600) * 60 * 1000; // 0 = ~100 years; cap at 1 year
        const expiresAt = Date.now() + durationMs;
        const type = 'sys_admin_ban';
        await banLogs.set(targetUserId, { type, duration: durationMs, expiresAt });

        logger.info(
          `[SysAdmin.banUser] Banned user ${targetUserId} for ${durationMs / 60000} minutes`,
        );
        return toJson({
          message: `User banned for ${durationMinutes <= 0 ? 'indefinite' : durationMinutes} minutes`,
          userId: targetUserId,
          expiresAt: new Date(expiresAt).toISOString(),
        });
      } catch (e) {
        logger.error('[SysAdmin.banUser]', e);
        return toJson({ error: e.message || 'Failed to ban user' });
      }
    },
    {
      name: Tools.sys_admin_ban_user,
      description:
        'Ban a user. Required: userId or email. Optional: durationMinutes (default 60, 0 for indefinite).',
      schema: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          email: { type: 'string' },
          durationMinutes: { type: 'integer', minimum: 0 },
        },
        required: [],
      },
    },
  );

  const unbanUserTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { userId: inputUserId, email: inputEmail } = rawInput || {};
      if (!inputUserId && !inputEmail) return toJson({ error: 'userId or email is required' });
      try {
        const resolved = await resolveUserForBan(inputUserId, inputEmail);
        if (!resolved) return toJson({ error: 'User not found' });
        const targetUserId = resolved.id;

        const banLogs = getLogStores(ViolationTypes.BAN);
        const hadBan = await banLogs.get(targetUserId);
        await banLogs.delete(targetUserId);

        if (!hadBan) {
          return toJson({ message: 'User was not banned', userId: targetUserId });
        }
        logger.info(`[SysAdmin.unbanUser] Unbanned user ${targetUserId}`);
        return toJson({ message: 'User unbanned', userId: targetUserId });
      } catch (e) {
        logger.error('[SysAdmin.unbanUser]', e);
        return toJson({ error: e.message || 'Failed to unban user' });
      }
    },
    {
      name: Tools.sys_admin_unban_user,
      description: 'Remove a user ban. Required: userId or email.',
      schema: {
        type: 'object',
        properties: { userId: { type: 'string' }, email: { type: 'string' } },
        required: [],
      },
    },
  );

  const ACCESS_ROLE_MAP = {
    viewer: { agent: AccessRoleIds.AGENT_VIEWER, remote: AccessRoleIds.REMOTE_AGENT_VIEWER },
    editor: { agent: AccessRoleIds.AGENT_EDITOR, remote: AccessRoleIds.REMOTE_AGENT_EDITOR },
    owner: { agent: AccessRoleIds.AGENT_OWNER, remote: AccessRoleIds.REMOTE_AGENT_OWNER },
  };

  const grantAgentAccessTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const {
        agentId,
        userId: inputUserId,
        email: inputEmail,
        accessRole = 'viewer',
      } = rawInput || {};
      if (!agentId) return toJson({ error: 'agentId is required' });
      if (!inputUserId && !inputEmail) return toJson({ error: 'userId or email is required' });
      const roleKey = String(accessRole).toLowerCase();
      if (!ACCESS_ROLE_MAP[roleKey]) {
        return toJson({ error: 'accessRole must be viewer, editor, or owner' });
      }
      try {
        const agent = await getAgent({ id: agentId });
        if (!agent) return toJson({ error: 'Agent not found' });
        const resolved = await resolveUserForBan(inputUserId, inputEmail);
        if (!resolved) return toJson({ error: 'User not found' });
        const targetUserId = resolved.id;
        const roles = ACCESS_ROLE_MAP[roleKey];
        await grantPermission({
          principalType: PrincipalType.USER,
          principalId: targetUserId,
          resourceType: ResourceType.AGENT,
          resourceId: agent._id,
          accessRoleId: roles.agent,
          grantedBy: userId,
        });
        await grantPermission({
          principalType: PrincipalType.USER,
          principalId: targetUserId,
          resourceType: ResourceType.REMOTE_AGENT,
          resourceId: agent._id,
          accessRoleId: roles.remote,
          grantedBy: userId,
        });
        logger.info(
          `[SysAdmin.grantAgentAccess] Granted ${roleKey} to user ${targetUserId} for agent ${agentId}`,
        );
        return toJson({
          message: `User granted ${roleKey} access`,
          agentId,
          userId: targetUserId,
          accessRole: roleKey,
        });
      } catch (e) {
        logger.error('[SysAdmin.grantAgentAccess]', e);
        return toJson({ error: e.message || 'Failed to grant agent access' });
      }
    },
    {
      name: Tools.sys_admin_grant_agent_access,
      description:
        'Grant a user access to an agent. Required: agentId, userId or email. Optional: accessRole (viewer, editor, owner; default viewer).',
      schema: {
        type: 'object',
        properties: {
          agentId: { type: 'string' },
          userId: { type: 'string' },
          email: { type: 'string' },
          accessRole: { type: 'string', enum: ['viewer', 'editor', 'owner'] },
        },
        required: ['agentId'],
      },
    },
  );

  const revokeAgentAccessTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { agentId, userId: inputUserId, email: inputEmail } = rawInput || {};
      if (!agentId) return toJson({ error: 'agentId is required' });
      if (!inputUserId && !inputEmail) return toJson({ error: 'userId or email is required' });
      try {
        const agent = await getAgent({ id: agentId });
        if (!agent) return toJson({ error: 'Agent not found' });
        const resolved = await resolveUserForBan(inputUserId, inputEmail);
        if (!resolved) return toJson({ error: 'User not found' });
        const targetUserId = resolved.id;
        const revokedPrincipal = { type: PrincipalType.USER, id: targetUserId };
        await bulkUpdateResourcePermissions({
          resourceType: ResourceType.AGENT,
          resourceId: agent._id,
          revokedPrincipals: [revokedPrincipal],
          grantedBy: userId,
        });
        await bulkUpdateResourcePermissions({
          resourceType: ResourceType.REMOTE_AGENT,
          resourceId: agent._id,
          revokedPrincipals: [revokedPrincipal],
          grantedBy: userId,
        });
        logger.info(
          `[SysAdmin.revokeAgentAccess] Revoked access for user ${targetUserId} from agent ${agentId}`,
        );
        return toJson({
          message: 'User access revoked',
          agentId,
          userId: targetUserId,
        });
      } catch (e) {
        logger.error('[SysAdmin.revokeAgentAccess]', e);
        return toJson({ error: e.message || 'Failed to revoke agent access' });
      }
    },
    {
      name: Tools.sys_admin_revoke_agent_access,
      description: "Revoke a user's access to an agent. Required: agentId, userId or email.",
      schema: {
        type: 'object',
        properties: {
          agentId: { type: 'string' },
          userId: { type: 'string' },
          email: { type: 'string' },
        },
        required: ['agentId'],
      },
    },
  );

  const inviteUserTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { email } = rawInput || {};
      if (!email || !String(email).trim()) return toJson({ error: 'email is required' });
      const normalizedEmail = String(email).trim().toLowerCase();
      if (!normalizedEmail.includes('@')) return toJson({ error: 'Invalid email address' });
      try {
        const existingUser = await findUser({ email: normalizedEmail }, '_id');
        if (existingUser) return toJson({ error: 'A user with that email already exists' });

        const token = await createInvite(normalizedEmail, { invitedBy: userId });
        if (token && typeof token === 'object' && token.message) {
          return toJson({ error: token.message });
        }

        const domainClient = process.env.DOMAIN_CLIENT || 'http://localhost:3080';
        const inviteLink = `${domainClient}/register?token=${token}`;
        const appName = process.env.APP_TITLE || 'Daily Thread';

        if (checkEmailConfig()) {
          await sendEmail({
            email: normalizedEmail,
            subject: `Invite to join ${appName}!`,
            payload: { appName, inviteLink, year: new Date().getFullYear() },
            template: 'inviteUser.handlebars',
            auditContext: { userId, source: 'sys_admin_invite' },
          });
          return toJson({ message: 'Invitation sent successfully' });
        }
        return toJson({
          message: 'Invitation created. Email not configured. Share this link with the user.',
          link: inviteLink,
        });
      } catch (e) {
        logger.error('[SysAdmin.inviteUser]', e);
        return toJson({ error: e.message || 'Failed to invite user' });
      }
    },
    {
      name: Tools.sys_admin_invite_user,
      description: 'Invite a user by email. Required: email.',
      schema: {
        type: 'object',
        properties: { email: { type: 'string' } },
        required: ['email'],
      },
    },
  );

  const sendPasswordResetTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { userId: targetUserId } = rawInput || {};
      if (!targetUserId) return toJson({ error: 'userId is required' });
      try {
        const user = await getUserById(targetUserId, 'email name username _id provider');
        if (!user) return toJson({ error: 'User not found' });
        if (user.provider !== 'local') {
          return toJson({ error: 'Password reset only for local auth users' });
        }

        await deleteTokens({ userId: user._id });
        const [resetToken, hash] = createTokenHash();
        await createToken({ userId: user._id, token: hash, expiresIn: 900 });
        const domains = { client: process.env.DOMAIN_CLIENT || 'http://localhost:3080' };
        const link = `${domains.client}/reset-password?token=${resetToken}&userId=${user._id}`;

        if (checkEmailConfig()) {
          await sendEmail({
            email: user.email,
            subject: 'Password Reset Request',
            payload: {
              appName: process.env.APP_TITLE || 'Daily Thread',
              name: user.name || user.username || user.email,
              link,
              year: new Date().getFullYear(),
            },
            template: 'requestPasswordReset.handlebars',
            auditContext: { userId, source: 'sys_admin_password_reset' },
          });
        }
        return toJson({
          message: 'If an account exists, a password reset link has been sent.',
          ...(!checkEmailConfig() && { link }),
        });
      } catch (e) {
        logger.error('[SysAdmin.sendPasswordReset]', e);
        return toJson({ error: e.message || 'Failed to send password reset' });
      }
    },
    {
      name: Tools.sys_admin_send_password_reset,
      description: 'Send password reset email. Required: userId.',
      schema: {
        type: 'object',
        properties: { userId: { type: 'string' } },
        required: ['userId'],
      },
    },
  );

  const listWorkspacesTool = tool(
    async () => {
      const err = requireAdmin();
      if (err) return toJson(err);
      try {
        const workspaces = await listWorkspaces();
        return toJson(
          workspaces.map((w) => ({
            _id: w._id?.toString(),
            id: w._id?.toString(),
            name: w.name,
            slug: w.slug,
            createdBy: w.createdBy?.toString(),
            maxMembers: w.maxMembers ?? 3,
            adminIds: (w.adminIds || []).map((id) => id?.toString()),
            createdAt: w.createdAt,
            updatedAt: w.updatedAt,
          })),
        );
      } catch (e) {
        logger.error('[SysAdmin.listWorkspaces]', e);
        return toJson({ error: e.message || 'Failed to list workspaces' });
      }
    },
    {
      name: Tools.sys_admin_list_workspaces,
      description: 'List all workspaces.',
      schema: { type: 'object', properties: {}, required: [] },
    },
  );

  const getWorkspaceTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { workspaceId } = rawInput || {};
      if (!workspaceId) return toJson({ error: 'workspaceId is required' });
      try {
        const workspace = await getWorkspaceById(workspaceId);
        if (!workspace) return toJson({ error: 'Workspace not found' });
        return toJson({
          _id: workspace._id?.toString(),
          id: workspace._id?.toString(),
          name: workspace.name,
          slug: workspace.slug,
          createdBy: workspace.createdBy?.toString(),
          maxMembers: workspace.maxMembers ?? 3,
          adminIds: (workspace.adminIds || []).map((id) => id?.toString()),
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
        });
      } catch (e) {
        logger.error('[SysAdmin.getWorkspace]', e);
        return toJson({ error: e.message || 'Failed to get workspace' });
      }
    },
    {
      name: Tools.sys_admin_get_workspace,
      description: 'Get workspace by ID. Required: workspaceId.',
      schema: {
        type: 'object',
        properties: { workspaceId: { type: 'string' } },
        required: ['workspaceId'],
      },
    },
  );

  const createWorkspaceTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { name, slug } = rawInput || {};
      if (!name || !slug) return toJson({ error: 'name and slug are required' });
      try {
        const workspace = await createWorkspace({
          name: String(name).trim(),
          slug: String(slug).trim(),
          createdBy: userId,
        });
        return toJson({
          _id: workspace._id?.toString(),
          id: workspace._id?.toString(),
          name: workspace.name,
          slug: workspace.slug,
          createdBy: workspace.createdBy?.toString(),
          maxMembers: workspace.maxMembers ?? 3,
          adminIds: workspace.adminIds ?? [],
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
        });
      } catch (e) {
        if (e.message?.includes('already exists') || e.code === 11000) {
          return toJson({ error: 'Workspace with this slug already exists' });
        }
        logger.error('[SysAdmin.createWorkspace]', e);
        return toJson({ error: e.message || 'Failed to create workspace' });
      }
    },
    {
      name: Tools.sys_admin_create_workspace,
      description: 'Create a workspace. Required: name, slug.',
      schema: {
        type: 'object',
        properties: { name: { type: 'string' }, slug: { type: 'string' } },
        required: ['name', 'slug'],
      },
    },
  );

  const updateWorkspaceTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { workspaceId, name, slug, maxMembers, adminIds } = rawInput || {};
      if (!workspaceId) return toJson({ error: 'workspaceId is required' });
      try {
        const updates = {};
        if (name !== undefined) updates.name = String(name);
        if (slug !== undefined) updates.slug = String(slug);
        if (maxMembers !== undefined) updates.maxMembers = Number(maxMembers);
        if (adminIds !== undefined && Array.isArray(adminIds)) {
          updates.adminIds = adminIds.map((id) => String(id));
        }
        const workspace = await updateWorkspace(workspaceId, updates);
        if (!workspace) return toJson({ error: 'Workspace not found' });
        return toJson({
          _id: workspace._id?.toString(),
          id: workspace._id?.toString(),
          name: workspace.name,
          slug: workspace.slug,
          createdBy: workspace.createdBy?.toString(),
          maxMembers: workspace.maxMembers ?? 3,
          adminIds: (workspace.adminIds || []).map((id) => id?.toString()),
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
        });
      } catch (e) {
        if (e.message?.includes('already exists') || e.code === 11000) {
          return toJson({ error: 'Workspace with this slug already exists' });
        }
        logger.error('[SysAdmin.updateWorkspace]', e);
        return toJson({ error: e.message || 'Failed to update workspace' });
      }
    },
    {
      name: Tools.sys_admin_update_workspace,
      description:
        'Update workspace. Required: workspaceId. Optional: name, slug, maxMembers, adminIds.',
      schema: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string' },
          name: { type: 'string' },
          slug: { type: 'string' },
          maxMembers: { type: 'number' },
          adminIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['workspaceId'],
      },
    },
  );

  const deleteWorkspaceTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { workspaceId } = rawInput || {};
      if (!workspaceId) return toJson({ error: 'workspaceId is required' });
      try {
        const workspace = await getWorkspaceById(workspaceId);
        if (!workspace) return toJson({ error: 'Workspace not found' });
        await deleteWorkspace(workspaceId);
        return toJson({ message: 'Workspace deleted' });
      } catch (e) {
        logger.error('[SysAdmin.deleteWorkspace]', e);
        return toJson({ error: e.message || 'Failed to delete workspace' });
      }
    },
    {
      name: Tools.sys_admin_delete_workspace,
      description: 'Delete a workspace. Required: workspaceId.',
      schema: {
        type: 'object',
        properties: { workspaceId: { type: 'string' } },
        required: ['workspaceId'],
      },
    },
  );

  const listWorkspaceMembersTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { workspaceId } = rawInput || {};
      if (!workspaceId) return toJson({ error: 'workspaceId is required' });
      try {
        const User = require('~/db/models').User;
        const workspace = await getWorkspaceById(workspaceId);
        if (!workspace) return toJson({ error: 'Workspace not found' });
        const members = await User.find({ workspace_id: workspaceId })
          .select('_id email name username role')
          .lean();
        const sanitized = members.map((u) => ({
          _id: u._id?.toString(),
          id: u._id?.toString(),
          email: u.email,
          name: u.name,
          username: u.username,
          role: u.role,
        }));
        return toJson({ members: sanitized });
      } catch (e) {
        logger.error('[SysAdmin.listWorkspaceMembers]', e);
        return toJson({ error: e.message || 'Failed to list members' });
      }
    },
    {
      name: Tools.sys_admin_list_workspace_members,
      description: 'List workspace members. Required: workspaceId.',
      schema: {
        type: 'object',
        properties: { workspaceId: { type: 'string' } },
        required: ['workspaceId'],
      },
    },
  );

  const inviteWorkspaceMemberTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { workspaceId, email } = rawInput || {};
      if (!workspaceId || !email?.trim())
        return toJson({ error: 'workspaceId and email are required' });
      try {
        const workspace = await getWorkspaceById(workspaceId);
        if (!workspace) return toJson({ error: 'Workspace not found' });
        const result = await inviteUserToWorkspace({
          workspaceId,
          email: String(email).trim(),
          invitedBy: userId,
        });
        if (!result.success) {
          if (result.errorCode === INVITE_ERROR_CODES.MEMBER_LIMIT) {
            return toJson({ error: result.error });
          }
          if (result.errorCode === INVITE_ERROR_CODES.ALREADY_IN_ANOTHER_WORKSPACE) {
            return toJson({ error: result.error });
          }
          return toJson({ error: result.error || 'Failed to invite user' });
        }
        return toJson({
          message: result.message,
          ...(result.link && { link: result.link }),
          ...(result.user && { user: result.user }),
        });
      } catch (e) {
        logger.error('[SysAdmin.inviteWorkspaceMember]', e);
        return toJson({ error: e.message || 'Failed to invite user' });
      }
    },
    {
      name: Tools.sys_admin_invite_workspace_member,
      description: 'Invite user to workspace. Required: workspaceId, email.',
      schema: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string' },
          email: { type: 'string' },
        },
        required: ['workspaceId', 'email'],
      },
    },
  );

  const removeWorkspaceMemberTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { workspaceId, userId: targetUserId } = rawInput || {};
      if (!workspaceId || !targetUserId)
        return toJson({ error: 'workspaceId and userId are required' });
      try {
        const User = require('~/db/models').User;
        if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
          return toJson({ error: 'Invalid userId' });
        }
        if (!mongoose.Types.ObjectId.isValid(workspaceId)) {
          return toJson({ error: 'Invalid workspaceId' });
        }
        const workspace = await getWorkspaceById(workspaceId);
        if (!workspace) return toJson({ error: 'Workspace not found' });
        const workspaceObjId = new mongoose.Types.ObjectId(workspaceId);
        const result = await User.updateOne(
          { _id: targetUserId, workspace_id: workspaceObjId },
          { $unset: { workspace_id: '' } },
        );
        if (result.modifiedCount === 0) {
          return toJson({ error: 'User not in this workspace or not found' });
        }
        return toJson({ message: 'Member removed from workspace' });
      } catch (e) {
        logger.error('[SysAdmin.removeWorkspaceMember]', e);
        return toJson({ error: e.message || 'Failed to remove member' });
      }
    },
    {
      name: Tools.sys_admin_remove_workspace_member,
      description: 'Remove member from workspace. Required: workspaceId, userId.',
      schema: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string' },
          userId: { type: 'string' },
        },
        required: ['workspaceId', 'userId'],
      },
    },
  );

  const getUserUsageTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { userId: targetUserId, limit = 50, startDate, endDate } = rawInput || {};
      if (!targetUserId) return toJson({ error: 'userId is required' });
      try {
        const filter = { user: targetUserId };
        if (startDate || endDate) {
          filter.createdAt = {};
          if (startDate) filter.createdAt.$gte = new Date(startDate);
          if (endDate) filter.createdAt.$lte = new Date(endDate);
        }
        const limitNum = Math.min(100, parseInt(limit, 10) || 50);
        const txns = await Transaction.find(filter).sort({ createdAt: -1 }).limit(limitNum).lean();
        const transactions = txns.map((t) => ({
          id: t._id?.toString(),
          user: t.user?.toString(),
          conversationId: t.conversationId,
          tokenType: t.tokenType,
          model: t.model,
          rawAmount: t.rawAmount,
          tokenValue: t.tokenValue,
          inputTokens: t.inputTokens,
          writeTokens: t.writeTokens,
          readTokens: t.readTokens,
          createdAt: t.createdAt,
        }));
        const total = await Transaction.countDocuments(filter);
        return toJson({ transactions, total });
      } catch (e) {
        logger.error('[SysAdmin.getUserUsage]', e);
        return toJson({ error: e.message || 'Failed to get usage' });
      }
    },
    {
      name: Tools.sys_admin_get_user_usage,
      description:
        'Get token usage for a user. Required: userId. Optional: limit, startDate, endDate.',
      schema: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          limit: { type: 'number' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
        },
        required: ['userId'],
      },
    },
  );

  const getUserBalanceTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { userId: targetUserId, includeTransactions } = rawInput || {};
      if (!targetUserId) return toJson({ error: 'userId is required' });
      try {
        const balance = await Balance.findOne({ user: targetUserId }).lean();
        const result = {
          userId: targetUserId,
          tokenCredits: balance?.tokenCredits ?? 0,
        };
        if (
          includeTransactions === true ||
          includeTransactions === 'true' ||
          includeTransactions === 1
        ) {
          const txns = await getTransactions({ user: targetUserId });
          result.recentTransactions = txns
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 20)
            .map((t) => ({
              id: t._id?.toString(),
              conversationId: t.conversationId,
              tokenType: t.tokenType,
              model: t.model,
              rawAmount: t.rawAmount,
              tokenValue: t.tokenValue,
              createdAt: t.createdAt,
            }));
        }
        return toJson(result);
      } catch (e) {
        logger.error('[SysAdmin.getUserBalance]', e);
        return toJson({ error: e.message || 'Failed to get balance' });
      }
    },
    {
      name: Tools.sys_admin_get_user_balance,
      description: "Get user's token balance. Required: userId. Optional: includeTransactions.",
      schema: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          includeTransactions: { type: 'boolean' },
        },
        required: ['userId'],
      },
    },
  );

  const listUsageTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const {
        userId,
        conversationId,
        model,
        tokenType,
        startDate,
        endDate,
        limit = 50,
        page = 1,
      } = rawInput || {};
      try {
        const filter = {};
        if (userId) filter.user = userId;
        if (conversationId) filter.conversationId = conversationId;
        if (model) filter.model = model;
        if (tokenType) filter.tokenType = tokenType;
        if (startDate || endDate) {
          filter.createdAt = {};
          if (startDate) filter.createdAt.$gte = new Date(startDate);
          if (endDate) filter.createdAt.$lte = new Date(endDate);
        }
        const limitNum = Math.min(100, parseInt(limit, 10) || 50);
        const skip = (Math.max(1, parseInt(page, 10)) - 1) * limitNum;
        const [txns, total] = await Promise.all([
          Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
          Transaction.countDocuments(filter),
        ]);
        const transactions = txns.map((t) => ({
          id: t._id?.toString(),
          user: t.user?.toString(),
          conversationId: t.conversationId,
          tokenType: t.tokenType,
          model: t.model,
          rawAmount: t.rawAmount,
          tokenValue: t.tokenValue,
          createdAt: t.createdAt,
        }));
        return toJson({
          transactions,
          total,
          page: Math.floor(skip / limitNum) + 1,
          limit: limitNum,
        });
      } catch (e) {
        logger.error('[SysAdmin.listUsage]', e);
        return toJson({ error: e.message || 'Failed to list usage' });
      }
    },
    {
      name: Tools.sys_admin_list_usage,
      description:
        'List transactions. Optional: userId, conversationId, model, tokenType, startDate, endDate, limit, page.',
      schema: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          conversationId: { type: 'string' },
          model: { type: 'string' },
          tokenType: { type: 'string', enum: ['prompt', 'completion', 'credits'] },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          limit: { type: 'number' },
          page: { type: 'number' },
        },
        required: [],
      },
    },
  );

  const usageAggregateTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { userId, startDate, endDate } = rawInput || {};
      try {
        const match = {};
        if (userId) match.user = userId;
        if (startDate || endDate) {
          match.createdAt = {};
          if (startDate) match.createdAt.$gte = new Date(startDate);
          if (endDate) match.createdAt.$lte = new Date(endDate);
        }
        const pipeline = [
          { $match: Object.keys(match).length ? match : {} },
          {
            $group: {
              _id: '$user',
              totalRawAmount: { $sum: '$rawAmount' },
              totalTokenValue: { $sum: '$tokenValue' },
              transactionCount: { $sum: 1 },
            },
          },
          { $sort: { totalTokenValue: -1 } },
        ];
        const results = await Transaction.aggregate(pipeline);
        const aggregated = results.map((r) => ({
          userId: r._id?.toString(),
          totalRawAmount: r.totalRawAmount,
          totalTokenValue: r.totalTokenValue,
          transactionCount: r.transactionCount,
        }));
        return toJson({ aggregated });
      } catch (e) {
        logger.error('[SysAdmin.usageAggregate]', e);
        return toJson({ error: e.message || 'Failed to aggregate usage' });
      }
    },
    {
      name: Tools.sys_admin_usage_aggregate,
      description: 'Aggregate usage by user. Optional: userId, startDate, endDate.',
      schema: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
        },
        required: [],
      },
    },
  );

  const systemTools = {
    [Tools.execute_code]: true,
    [Tools.file_search]: true,
    [Tools.web_search]: true,
  };

  const listAgentsTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      try {
        const Agent = require('~/db/models').Agent;
        const { search = '', limit = 50, after } = rawInput || {};
        const query = {};
        if (search && String(search).trim()) {
          const escaped = String(search)
            .trim()
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          query.name = { $regex: escaped, $options: 'i' };
        }
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
        let cursorCondition = {};
        if (after) {
          try {
            const parsed = JSON.parse(Buffer.from(after, 'base64').toString('utf8'));
            const { updatedAt, _id } = parsed;
            cursorCondition = {
              $or: [
                { updatedAt: { $lt: new Date(updatedAt) } },
                { updatedAt: new Date(updatedAt), _id: { $gt: new mongoose.Types.ObjectId(_id) } },
              ],
            };
          } catch (e) {
            logger.warn('[SysAdmin.listAgents] Invalid cursor:', e.message);
          }
        }
        const baseQuery = Object.keys(cursorCondition).length
          ? { $and: [query, cursorCondition] }
          : query;
        const agents = await Agent.find(baseQuery, {
          id: 1,
          _id: 1,
          name: 1,
          avatar: 1,
          author: 1,
          description: 1,
          updatedAt: 1,
          category: 1,
          support_contact: 1,
          is_promoted: 1,
        })
          .sort({ updatedAt: -1, _id: 1 })
          .limit(limitNum + 1)
          .lean();
        const hasMore = agents.length > limitNum;
        const data = (hasMore ? agents.slice(0, limitNum) : agents).map((a) => {
          if (a.author) a.author = a.author.toString();
          return a;
        });
        let nextCursor = null;
        if (hasMore && data.length > 0) {
          const last = data[data.length - 1];
          nextCursor = Buffer.from(
            JSON.stringify({
              updatedAt: last.updatedAt?.toISOString?.(),
              _id: last._id?.toString?.(),
            }),
          ).toString('base64');
        }
        return toJson({
          object: 'list',
          data,
          first_id: data.length > 0 ? data[0].id : null,
          last_id: data.length > 0 ? data[data.length - 1].id : null,
          has_more: hasMore,
          after: nextCursor,
        });
      } catch (e) {
        logger.error('[SysAdmin.listAgents]', e);
        return toJson({ error: e.message || 'Failed to list agents' });
      }
    },
    {
      name: Tools.sys_admin_list_agents,
      description: 'List all agents. Optional: search, limit, after.',
      schema: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          limit: { type: 'number' },
          after: { type: 'string' },
        },
        required: [],
      },
    },
  );

  const listAssignableToolsTool = tool(
    async () => {
      const err = requireAdmin();
      if (err) return toJson(err);
      try {
        const capabilities = Object.values(AgentCapabilities).map((id) => ({
          id,
          description: CAPABILITY_DESCRIPTIONS[id] ?? id,
        }));
        const cachedTools = (await getCachedTools()) ?? {};
        const toolsList = [];
        for (const toolId of Object.keys(cachedTools)) {
          const toolDef = getToolDefinition(toolId);
          const manifestEntry = manifestToolMap[toolId];
          const name = manifestEntry?.name ?? toolDef?.name ?? toolId;
          const description = manifestEntry?.description ?? toolDef?.description ?? '';
          toolsList.push({ id: toolId, name, description });
        }
        toolsList.sort((a, b) => a.id.localeCompare(b.id));
        return toJson({
          capabilities,
          tools: toolsList,
          hint: 'Use capability IDs in agent.capabilities; use tool IDs in agent.tools array when creating/updating agents.',
        });
      } catch (e) {
        logger.error('[SysAdmin.listAssignableTools]', e);
        return toJson({ error: e.message || 'Failed to list assignable tools' });
      }
    },
    {
      name: Tools.sys_admin_list_assignable_tools,
      description:
        'List all capabilities and tools for agent assignment. Use when creating/updating agents.',
      schema: { type: 'object', properties: {}, required: [] },
    },
  );

  const getAgentTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { id } = rawInput || {};
      if (!id) return toJson({ error: 'id is required' });
      try {
        const agent = await getAgent({ id });
        if (!agent) return toJson({ error: 'Agent not found' });
        const { _id, author, ...rest } = agent;
        const payload = { _id: _id?.toString(), id: agent.id, author: author?.toString(), ...rest };
        if (!('inbound_instructions' in payload) || payload.inbound_instructions == null) {
          payload.inbound_instructions = {};
        }
        return toJson(payload);
      } catch (e) {
        logger.error('[SysAdmin.getAgent]', e);
        return toJson({ error: e.message || 'Failed to get agent' });
      }
    },
    {
      name: Tools.sys_admin_get_agent,
      description: 'Get full agent by ID. Required: id.',
      schema: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Agent ID (e.g. system-general)' } },
        required: ['id'],
      },
    },
  );

  const createAgentTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      try {
        const validatedData = agentCreateSchema.parse(rawInput || {});
        const { tools = [], ...agentData } = removeNullishValues(validatedData);
        if (agentData.model_parameters && typeof agentData.model_parameters === 'object') {
          agentData.model_parameters = removeNullishValues(agentData.model_parameters, true);
        }
        agentData.id = `agent_${nanoid()}`;
        agentData.author = userId;
        agentData.tools = [];
        const availableTools = (await getCachedTools()) ?? {};
        for (const tool of tools) {
          if (
            availableTools[tool] ||
            systemTools[tool] ||
            (typeof tool === 'string' && tool.includes(Constants.mcp_delimiter))
          ) {
            agentData.tools.push(tool);
          }
        }
        const agent = await createAgent(agentData);
        try {
          await Promise.all([
            grantPermission({
              principalType: PrincipalType.USER,
              principalId: userId,
              resourceType: ResourceType.AGENT,
              resourceId: agent._id,
              accessRoleId: AccessRoleIds.AGENT_OWNER,
              grantedBy: userId,
            }),
            grantPermission({
              principalType: PrincipalType.USER,
              principalId: userId,
              resourceType: ResourceType.REMOTE_AGENT,
              resourceId: agent._id,
              accessRoleId: AccessRoleIds.REMOTE_AGENT_OWNER,
              grantedBy: userId,
            }),
          ]);
        } catch (permErr) {
          logger.error('[SysAdmin.createAgent] Permission grant failed:', permErr);
        }
        const { _id, author, ...rest } = agent;
        return toJson({ _id: _id?.toString(), id: agent.id, author: author?.toString(), ...rest });
      } catch (e) {
        if (e.name === 'ZodError') {
          return toJson({ error: 'Validation failed', details: e.errors });
        }
        logger.error('[SysAdmin.createAgent]', e);
        return toJson({ error: e.message || 'Failed to create agent' });
      }
    },
    {
      name: Tools.sys_admin_create_agent,
      description:
        'Create agent. Required: name, provider, model. Optional: instructions, tools, description, category, edges.',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          provider: { type: 'string' },
          model: { type: 'string' },
          instructions: { type: 'string' },
          tools: { type: 'array', items: { type: 'string' } },
          description: { type: 'string' },
          category: { type: 'string' },
          edges: { type: 'array', items: { type: 'object' } },
        },
        required: ['name', 'provider', 'model'],
      },
    },
  );

  const updateAgentTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { agentId, ...updates } = rawInput || {};
      if (!agentId) return toJson({ error: 'agentId is required' });
      try {
        const agent = await getAgent({ id: agentId });
        if (!agent) return toJson({ error: 'Agent not found' });
        const validatedData = agentUpdateSchema.parse({ ...updates });
        const updateData = removeNullishValues(validatedData);
        if (Object.keys(updateData).length === 0) {
          return toJson({ error: 'No valid fields to update' });
        }
        const updated = await updateAgent({ id: agentId }, updateData, { updatingUserId: userId });
        if (!updated) return toJson({ error: 'Failed to update agent' });
        const { _id, author, ...rest } = updated;
        return toJson({
          _id: _id?.toString(),
          id: updated.id,
          author: author?.toString(),
          ...rest,
        });
      } catch (e) {
        if (e.name === 'ZodError') {
          return toJson({ error: 'Validation failed', details: e.errors });
        }
        logger.error('[SysAdmin.updateAgent]', e);
        return toJson({ error: e.message || 'Failed to update agent' });
      }
    },
    {
      name: Tools.sys_admin_update_agent,
      description:
        'Update agent. Required: agentId. Optional: name, instructions, tools, model, provider, description, category, edges, inbound_instructions (object: telegram, email, etc. -> instruction string).',
      schema: {
        type: 'object',
        properties: {
          agentId: { type: 'string' },
          name: { type: 'string' },
          instructions: { type: 'string' },
          tools: { type: 'array', items: { type: 'string' } },
          model: { type: 'string' },
          provider: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string' },
          edges: { type: 'array', items: { type: 'object' } },
          inbound_instructions: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Per-channel instructions (e.g. telegram, email) when run comes from that inbound source.',
          },
        },
        required: ['agentId'],
      },
    },
  );

  const deleteAgentTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { agentId } = rawInput || {};
      if (!agentId) return toJson({ error: 'agentId is required' });
      try {
        const agent = await deleteAgent({ id: agentId });
        if (!agent) return toJson({ error: 'Agent not found' });
        return toJson({ message: 'Agent deleted successfully' });
      } catch (e) {
        logger.error('[SysAdmin.deleteAgent]', e);
        return toJson({ error: e.message || 'Failed to delete agent' });
      }
    },
    {
      name: Tools.sys_admin_delete_agent,
      description: 'Delete agent. Required: agentId.',
      schema: {
        type: 'object',
        properties: { agentId: { type: 'string' } },
        required: ['agentId'],
      },
    },
  );

  const duplicateAgentTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { agentId } = rawInput || {};
      if (!agentId) return toJson({ error: 'agentId is required' });
      const sensitiveFields = ['api_key', 'oauth_client_id', 'oauth_client_secret'];
      try {
        const agent = await getAgent({ id: agentId });
        if (!agent) return toJson({ error: 'Agent not found' });
        const {
          id: _id,
          _id: __id,
          author: _author,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          tool_resources: _tool_resources = {},
          versions: _versions,
          __v: _v,
          ...cloneData
        } = agent;
        cloneData.name = `${agent.name} (${new Date().toLocaleString('en-US', {
          dateStyle: 'short',
          timeStyle: 'short',
          hour12: false,
        })})`;
        if (_tool_resources?.[EToolResources.context]) {
          cloneData.tool_resources = {
            [EToolResources.context]: _tool_resources[EToolResources.context],
          };
        }
        if (_tool_resources?.[EToolResources.ocr]) {
          cloneData.tool_resources = {
            [EToolResources.context]: {
              ...(_tool_resources[EToolResources.context] ?? {}),
              ..._tool_resources[EToolResources.ocr],
            },
          };
        }
        const newAgentId = `agent_${nanoid()}`;
        const newAgentData = Object.assign(cloneData, { id: newAgentId, author: userId });
        const originalActions = (await getActions({ agent_id: agentId }, true)) ?? [];
        const newActionIds = [];
        for (const action of originalActions) {
          try {
            const newActionId = nanoid();
            const [domain] = action.action_id.split(actionDelimiter);
            const fullActionId = `${domain}${actionDelimiter}${newActionId}`;
            const filteredMetadata = { ...(action.metadata || {}) };
            for (const field of sensitiveFields) delete filteredMetadata[field];
            await updateAction(
              { action_id: newActionId },
              { metadata: filteredMetadata, agent_id: newAgentId, user: userId },
            );
            newActionIds.push(fullActionId);
          } catch (actionErr) {
            logger.error('[SysAdmin.duplicateAgent] Error duplicating action:', actionErr);
          }
        }
        newAgentData.actions = newActionIds;
        const newAgent = await createAgent(newAgentData);
        try {
          await Promise.all([
            grantPermission({
              principalType: PrincipalType.USER,
              principalId: userId,
              resourceType: ResourceType.AGENT,
              resourceId: newAgent._id,
              accessRoleId: AccessRoleIds.AGENT_OWNER,
              grantedBy: userId,
            }),
            grantPermission({
              principalType: PrincipalType.USER,
              principalId: userId,
              resourceType: ResourceType.REMOTE_AGENT,
              resourceId: newAgent._id,
              accessRoleId: AccessRoleIds.REMOTE_AGENT_OWNER,
              grantedBy: userId,
            }),
          ]);
        } catch (permErr) {
          logger.error('[SysAdmin.duplicateAgent] Permission grant failed:', permErr);
        }
        const { _id: agentObjId, author: agentAuthor, ...agentRest } = newAgent;
        return toJson({
          agent: {
            _id: agentObjId?.toString(),
            id: newAgent.id,
            author: agentAuthor?.toString(),
            ...agentRest,
          },
        });
      } catch (e) {
        logger.error('[SysAdmin.duplicateAgent]', e);
        return toJson({ error: e.message || 'Failed to duplicate agent' });
      }
    },
    {
      name: Tools.sys_admin_duplicate_agent,
      description: 'Duplicate agent. Required: agentId.',
      schema: {
        type: 'object',
        properties: { agentId: { type: 'string' } },
        required: ['agentId'],
      },
    },
  );

  const listAgentVersionsTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { agentId } = rawInput || {};
      if (!agentId) return toJson({ error: 'agentId is required' });
      try {
        const agent = await getAgent({ id: agentId });
        if (!agent) return toJson({ error: 'Agent not found' });
        const versions = agent.versions || [];
        const list = versions.map((v, i) => ({
          index: i,
          name: v.name ?? agent.name,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
          ...(i === versions.length - 2 && {
            note: 'Previous version (use versionIndex: -1 to revert)',
          }),
        }));
        return toJson({
          agentId,
          currentVersion: versions.length,
          versions: list,
          hint: 'Use versionIndex in sys_admin_revert_agent_version, or -1 for previous.',
        });
      } catch (e) {
        logger.error('[SysAdmin.listAgentVersions]', e);
        return toJson({ error: e.message || 'Failed to list agent versions' });
      }
    },
    {
      name: Tools.sys_admin_list_agent_versions,
      description:
        'List version history. Required: agentId. Use before revert to pick versionIndex.',
      schema: {
        type: 'object',
        properties: { agentId: { type: 'string' } },
        required: ['agentId'],
      },
    },
  );

  const revertAgentVersionTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { agentId, versionIndex } = rawInput || {};
      if (!agentId) return toJson({ error: 'agentId is required' });
      if (versionIndex === undefined || versionIndex === null)
        return toJson({ error: 'versionIndex is required' });
      const idx = parseInt(versionIndex, 10);
      if (isNaN(idx)) return toJson({ error: 'versionIndex must be a number' });
      try {
        let targetIdx = idx;
        if (idx === -1) {
          const agent = await getAgent({ id: agentId });
          if (!agent) return toJson({ error: 'Agent not found' });
          const versions = agent.versions || [];
          if (versions.length < 2) return toJson({ error: 'No previous version to revert to' });
          targetIdx = versions.length - 2;
        } else if (idx < 0) {
          return toJson({ error: 'versionIndex must be 0 or greater, or -1 for previous version' });
        }
        const agent = await revertAgentVersion({ id: agentId }, targetIdx);
        const { _id, author, ...rest } = agent;
        return toJson({ _id: _id?.toString(), id: agent.id, author: author?.toString(), ...rest });
      } catch (e) {
        logger.error('[SysAdmin.revertAgentVersion]', e);
        return toJson({ error: e.message || 'Failed to revert agent version' });
      }
    },
    {
      name: Tools.sys_admin_revert_agent_version,
      description:
        'Revert agent to version. Required: agentId, versionIndex (0-based or -1 for previous).',
      schema: {
        type: 'object',
        properties: {
          agentId: { type: 'string' },
          versionIndex: { type: 'number' },
        },
        required: ['agentId', 'versionIndex'],
      },
    },
  );

  const seedSystemAgentsTool = tool(
    async () => {
      const err = requireAdmin();
      if (err) return toJson(err);
      try {
        const appConfig = await getAppConfig();
        await seedSystemAgents(appConfig);
        return toJson({ message: 'System agents seeded successfully' });
      } catch (e) {
        logger.error('[SysAdmin.seedSystemAgents]', e);
        return toJson({ error: e.message || 'Failed to seed system agents' });
      }
    },
    {
      name: Tools.sys_admin_seed_system_agents,
      description: 'Seed system agents from librechat.yaml. Creates missing only.',
      schema: { type: 'object', properties: {}, required: [] },
    },
  );

  const tailLogsTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { level = 'error', date, limit = 50, search } = rawInput || {};
      const levelVal = level === 'debug' ? 'debug' : 'error';
      const dateStr =
        date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
      const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
      try {
        const logDir = getLogDirectory();
        const filePath = path.join(logDir, `${levelVal}-${dateStr}.log`);
        let content;
        try {
          content = await fs.readFile(filePath, 'utf8');
        } catch (e) {
          if (e.code === 'ENOENT') {
            return toJson({ error: 'Log file not found', file: filePath });
          }
          throw e;
        }
        const lines = content.split('\n').filter((l) => l.trim());
        const lastLines = lines.slice(-limitNum);
        const entries = [];
        for (const line of lastLines) {
          try {
            const parsed = JSON.parse(line);
            const msg = parsed.message ?? '';
            if (search && String(search).trim()) {
              if (!msg.toLowerCase().includes(String(search).trim().toLowerCase())) {
                continue;
              }
            }
            const truncated = msg.length > 500 ? msg.slice(0, 500) + '...' : msg;
            entries.push({
              ...parsed,
              message: truncated,
            });
          } catch (_parseErr) {
            entries.push({ raw: line.slice(0, 500), parseError: true });
          }
        }
        return toJson({
          entries,
          totalReturned: entries.length,
          file: filePath,
        });
      } catch (e) {
        logger.error('[SysAdmin.tailLogs]', e);
        return toJson({ error: e.message || 'Failed to read logs' });
      }
    },
    {
      name: Tools.sys_admin_tail_logs,
      description:
        'Read recent server log entries (error or debug). Optional: level (error|debug), date (YYYY-MM-DD), limit (1-200), search (substring filter).',
      schema: {
        type: 'object',
        properties: {
          level: { type: 'string', enum: ['error', 'debug'] },
          date: { type: 'string' },
          limit: { type: 'number' },
          search: { type: 'string' },
        },
        required: [],
      },
    },
  );

  const listEnvTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { prefix, includeValues = false } = rawInput || {};
      let keys = Object.keys(process.env || {});
      if (prefix && String(prefix).trim()) {
        keys = keys.filter((k) => k.startsWith(prefix));
      }
      keys.sort();
      if (!includeValues) {
        return toJson({ keys, count: keys.length });
      }
      const env = {};
      for (const k of keys) {
        env[k] = isSensitiveKey(k) ? '[REDACTED]' : (process.env[k] ?? '');
      }
      return toJson({ env });
    },
    {
      name: Tools.sys_admin_list_env,
      description:
        'List environment variable names. Sensitive values redacted. Optional: prefix, includeValues.',
      schema: {
        type: 'object',
        properties: {
          prefix: { type: 'string' },
          includeValues: { type: 'boolean' },
        },
        required: [],
      },
    },
  );

  const searchEventLogsTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      try {
        const result = await searchEventLogs(rawInput || {});
        const events = result.events.map((e) => ({
          _id: e._id?.toString(),
          type: e.type,
          event: e.event,
          userId: e.userId?.toString(),
          metadata: e.metadata,
          createdAt: e.createdAt,
        }));
        return toJson({ events, total: result.total, limit: result.limit, skip: result.skip });
      } catch (e) {
        logger.error('[SysAdmin.searchEventLogs]', e);
        return toJson({ error: e.message || 'Failed to search event logs' });
      }
    },
    {
      name: Tools.sys_admin_search_event_logs,
      description:
        'Search audit event logs (email sent, etc.). Optional: type, event, userId, conversationId, agentId, scheduleId, to, subject, source, success, startDate, endDate, search (substring), limit (1-200), skip.',
      schema: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Event type (e.g. email)' },
          event: { type: 'string', description: 'Event name (e.g. email_sent)' },
          userId: { type: 'string', description: 'Filter by user' },
          conversationId: { type: 'string', description: 'metadata.conversationId' },
          agentId: { type: 'string', description: 'metadata.agentId' },
          scheduleId: { type: 'string', description: 'metadata.scheduleId' },
          to: { type: 'string', description: 'Substring match on recipient email' },
          subject: { type: 'string', description: 'Substring match on subject' },
          source: { type: 'string', description: 'Exact match on metadata.source' },
          success: { type: 'boolean', description: 'Filter by metadata.success' },
          startDate: { type: 'string', description: 'createdAt >= (YYYY-MM-DD or ISO)' },
          endDate: { type: 'string', description: 'createdAt <= (YYYY-MM-DD or ISO)' },
          search: { type: 'string', description: 'Substring across to, subject, source' },
          limit: { type: 'number', description: '1-200, default 50' },
          skip: { type: 'number', description: 'Offset for pagination' },
        },
        required: [],
      },
    },
  );

  const listAllToolsTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { agentId: agentIdForOverride } = rawInput || {};
      try {
        const registryDefs = getAllToolDefinitions();
        const cachedTools = (await getCachedTools()) ?? {};
        const toolsMap = new Map();
        for (const def of registryDefs) {
          toolsMap.set(def.name, {
            id: def.name,
            name: def.name,
            description: def.description ?? '',
            schema: def.schema ?? null,
          });
        }
        for (const toolId of Object.keys(cachedTools)) {
          if (!toolsMap.has(toolId)) {
            const def = getToolDefinition(toolId);
            const manifestEntry = manifestToolMap[toolId];
            const name = manifestEntry?.name ?? def?.name ?? toolId;
            const description = manifestEntry?.description ?? def?.description ?? '';
            const schema = def?.schema ?? null;
            toolsMap.set(toolId, { id: toolId, name, description, schema });
          }
        }
        const toolsList = Array.from(toolsMap.values());
        if (agentIdForOverride && toolsList.length > 0) {
          const agentObjId = mongoose.Types.ObjectId.isValid(agentIdForOverride)
            ? agentIdForOverride
            : null;
          for (const t of toolsList) {
            const ov = await getOverride(t.id, agentObjId);
            t.hasOverride = !!ov;
          }
        }
        toolsList.sort((a, b) => a.id.localeCompare(b.id));
        return toJson({ tools: toolsList });
      } catch (e) {
        logger.error('[SysAdmin.listAllTools]', e);
        return toJson({ error: e.message || 'Failed to list tools' });
      }
    },
    {
      name: Tools.sys_admin_list_all_tools,
      description:
        'List all tools (registry + MCP) with id, name, description, schema. Optional: agentId for hasOverride.',
      schema: {
        type: 'object',
        properties: { agentId: { type: 'string' } },
        required: [],
      },
    },
  );

  const createToolOverrideTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const {
        toolId,
        agentId,
        userId: userIdParam,
        description,
        schema,
        requiresApproval,
      } = rawInput || {};
      if (!toolId || typeof toolId !== 'string') return toJson({ error: 'toolId is required' });
      try {
        const schemaParam =
          typeof schema === 'string'
            ? (() => {
                try {
                  return JSON.parse(schema);
                } catch {
                  return null;
                }
              })()
            : schema;
        let requiresApprovalVal;
        if (requiresApproval === true || requiresApproval === false) {
          requiresApprovalVal = requiresApproval;
        } else if (requiresApproval === 'true') {
          requiresApprovalVal = true;
        } else if (requiresApproval === 'false') {
          requiresApprovalVal = false;
        } else {
          requiresApprovalVal = undefined;
        }
        const cachedTools = (await getCachedTools()) ?? {};
        const def = getToolDefinition(toolId);
        if (!def && !cachedTools[toolId]) {
          return toJson({ error: 'toolId not found in registry or cached tools' });
        }
        const hasContent =
          (description != null && description !== '') ||
          (schemaParam != null && typeof schemaParam === 'object') ||
          requiresApprovalVal === true ||
          requiresApprovalVal === false;
        if (!hasContent) {
          return toJson({
            error: 'At least one of description, schema, or requiresApproval is required',
          });
        }
        let agentObjId = null;
        if (agentId) {
          if (mongoose.Types.ObjectId.isValid(agentId)) {
            agentObjId = new mongoose.Types.ObjectId(agentId);
          } else {
            const agent = await getAgent({ id: agentId });
            if (agent) agentObjId = agent._id;
          }
        }
        let userObjId = null;
        if (userIdParam && mongoose.Types.ObjectId.isValid(userIdParam)) {
          userObjId = new mongoose.Types.ObjectId(userIdParam);
        }
        const existing = await getOverrideById({ toolId, agentId: agentObjId, userId: userObjId });
        if (existing) {
          return toJson({ error: 'Override already exists for this toolId, agentId, and userId' });
        }
        const doc = await createOverride({
          toolId: toolId.trim(),
          agentId: agentObjId,
          userId: userObjId,
          description: description ?? null,
          schema: schemaParam ?? null,
          requiresApproval: requiresApprovalVal,
          createdBy: userId,
        });
        return toJson({
          _id: doc._id?.toString(),
          toolId: doc.toolId,
          agentId: doc.agentId?.toString() ?? null,
          userId: doc.userId?.toString() ?? null,
          description: doc.description,
          schema: doc.schema,
          requiresApproval: doc.requiresApproval,
        });
      } catch (e) {
        logger.error('[SysAdmin.createToolOverride]', e);
        return toJson({ error: e.message || 'Failed to create override' });
      }
    },
    {
      name: Tools.sys_admin_create_tool_override,
      description:
        'Create tool override. Required: toolId. Optional: agentId (omit for global), userId (omit for agent/global), description, schema, requiresApproval (gate/ungate approval). Omit schema if only changing requiresApproval. Example: { "toolId": "file_search", "requiresApproval": false } to ungate.',
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          toolId: { type: 'string' },
          agentId: { type: 'string' },
          userId: { type: 'string', description: 'User _id for per-user override' },
          description: { type: 'string' },
          schema: {
            oneOf: [
              { type: 'object', description: 'Full JSON Schema object' },
              { type: 'string', description: 'JSON string of the schema' },
            ],
            description:
              "Override the tool's JSON Schema. Pass as object or JSON string. Omit if not changing schema.",
          },
          requiresApproval: { type: 'boolean', description: 'true=gate, false=ungate' },
        },
        required: ['toolId'],
      },
    },
  );

  const getToolOverrideTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { overrideId, toolId, agentId, userId } = rawInput || {};
      if (!overrideId && !toolId) return toJson({ error: 'overrideId or toolId is required' });
      try {
        const doc = await getOverrideById({ overrideId, toolId, agentId, userId });
        if (!doc) return toJson({ error: 'Override not found' });
        return toJson({
          _id: doc._id?.toString(),
          toolId: doc.toolId,
          agentId: doc.agentId?.toString() ?? null,
          userId: doc.userId?.toString() ?? null,
          description: doc.description,
          schema: doc.schema,
          requiresApproval: doc.requiresApproval,
          createdBy: doc.createdBy?.toString(),
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        });
      } catch (e) {
        logger.error('[SysAdmin.getToolOverride]', e);
        return toJson({ error: e.message || 'Failed to get override' });
      }
    },
    {
      name: Tools.sys_admin_get_tool_override,
      description: 'Get override by overrideId or toolId+agentId+userId.',
      schema: {
        type: 'object',
        properties: {
          overrideId: { type: 'string' },
          toolId: { type: 'string' },
          agentId: { type: 'string' },
          userId: { type: 'string' },
        },
        required: [],
      },
    },
  );

  const updateToolOverrideTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { overrideId, description, schema, requiresApproval } = rawInput || {};
      if (!overrideId) return toJson({ error: 'overrideId is required' });
      try {
        const schemaParam =
          typeof schema === 'string'
            ? (() => {
                try {
                  return JSON.parse(schema);
                } catch {
                  return null;
                }
              })()
            : schema;
        let requiresApprovalVal;
        if (requiresApproval === true || requiresApproval === false) {
          requiresApprovalVal = requiresApproval;
        } else if (requiresApproval === 'true') {
          requiresApprovalVal = true;
        } else if (requiresApproval === 'false') {
          requiresApprovalVal = false;
        } else {
          requiresApprovalVal = undefined;
        }
        const updates = { description };
        if (schema !== undefined && schemaParam != null && typeof schemaParam === 'object') {
          updates.schema = schemaParam;
        }
        if (requiresApprovalVal !== undefined) {
          updates.requiresApproval = requiresApprovalVal;
        }
        const doc = await updateOverride(overrideId, updates);
        if (!doc) return toJson({ error: 'Override not found' });
        return toJson({
          _id: doc._id?.toString(),
          toolId: doc.toolId,
          agentId: doc.agentId?.toString() ?? null,
          userId: doc.userId?.toString() ?? null,
          description: doc.description,
          schema: doc.schema,
          requiresApproval: doc.requiresApproval,
        });
      } catch (e) {
        logger.error('[SysAdmin.updateToolOverride]', e);
        return toJson({ error: e.message || 'Failed to update override' });
      }
    },
    {
      name: Tools.sys_admin_update_tool_override,
      description:
        'Update override. Required: overrideId. Optional: description, schema, requiresApproval (gate/ungate). Omit schema if not changing. Pass schema as object or JSON string.',
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          overrideId: { type: 'string' },
          description: { type: 'string' },
          schema: {
            oneOf: [
              { type: 'object', description: 'Full JSON Schema object' },
              { type: 'string', description: 'JSON string of the schema' },
            ],
            description:
              'New JSON Schema for the tool. Pass as object or JSON string. Omit if not changing schema.',
          },
          requiresApproval: { type: 'boolean', description: 'true=gate, false=ungate' },
        },
        required: ['overrideId'],
      },
    },
  );

  const deleteToolOverrideTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { overrideId, toolId, agentId, userId } = rawInput || {};
      if (!overrideId && !toolId) return toJson({ error: 'overrideId or toolId is required' });
      try {
        const result = await deleteOverride({ overrideId, toolId, agentId, userId });
        if (!result.deleted) {
          return toJson({ error: result.error || 'Override not found' });
        }
        return toJson({ message: 'Override deleted' });
      } catch (e) {
        logger.error('[SysAdmin.deleteToolOverride]', e);
        return toJson({ error: e.message || 'Failed to delete override' });
      }
    },
    {
      name: Tools.sys_admin_delete_tool_override,
      description: 'Delete override by overrideId or toolId+agentId+userId.',
      schema: {
        type: 'object',
        properties: {
          overrideId: { type: 'string' },
          toolId: { type: 'string' },
          agentId: { type: 'string' },
          userId: { type: 'string' },
        },
        required: [],
      },
    },
  );

  const listToolOverridesTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { toolId, agentId, userId, globalOnly, limit = 50, page = 1 } = rawInput || {};
      try {
        const result = await listOverrides({
          toolId,
          agentId,
          userId,
          globalOnly,
          limit,
          page,
        });
        return toJson(result);
      } catch (e) {
        logger.error('[SysAdmin.listToolOverrides]', e);
        return toJson({ error: e.message || 'Failed to list overrides' });
      }
    },
    {
      name: Tools.sys_admin_list_tool_overrides,
      description:
        'List tool overrides. Optional: toolId, agentId, userId, globalOnly, limit, page. Returns requiresApproval, userId.',
      schema: {
        type: 'object',
        properties: {
          toolId: { type: 'string' },
          agentId: { type: 'string' },
          userId: { type: 'string' },
          globalOnly: { type: 'boolean' },
          limit: { type: 'number' },
          page: { type: 'number' },
        },
        required: [],
      },
    },
  );

  const listFeatureFlagsTool = tool(
    async () => {
      const err = requireAdmin();
      if (err) return toJson(err);
      try {
        const flags = await getEffectiveFeatureFlags();
        const allowedKeys = getAllowedKeys();
        return toJson({
          flags,
          allowedKeys,
          hint: 'Use sys_admin_set_feature_flag to change a flag. Changes apply immediately.',
        });
      } catch (e) {
        logger.error('[SysAdmin.listFeatureFlags]', e);
        return toJson({ error: e.message || 'Failed to list feature flags' });
      }
    },
    {
      name: Tools.sys_admin_list_feature_flags,
      description:
        'List all feature flags (key, value, description). Allowed keys: summarizeEnabled, toolsMenuEnabled, forkEnabled, regenerateEnabled, feedbackEnabled, copyEnabled, editEnabled, continueEnabled, balanceEnabled, toolCallDetailsEnabled, showBirthdayIcon, sharePointFilePickerEnabled, customFooter.',
      schema: { type: 'object', properties: {}, required: [] },
    },
  );

  const setFeatureFlagTool = tool(
    async (rawInput) => {
      const err = requireAdmin();
      if (err) return toJson(err);
      const { key, value } = rawInput || {};
      if (!key || value === undefined) {
        return toJson({ error: 'key and value are required' });
      }
      try {
        const result = await setFeatureFlag(key, value, userId);
        return toJson({ success: true, ...result });
      } catch (e) {
        logger.error('[SysAdmin.setFeatureFlag]', e);
        return toJson({ error: e.message || 'Failed to set feature flag' });
      }
    },
    {
      name: Tools.sys_admin_set_feature_flag,
      description:
        'Set a feature flag. key: summarizeEnabled|toolsMenuEnabled|forkEnabled|regenerateEnabled|feedbackEnabled|copyEnabled|editEnabled|continueEnabled|balanceEnabled|toolCallDetailsEnabled|showBirthdayIcon|sharePointFilePickerEnabled|customFooter. value: boolean for most, string for customFooter.',
      schema: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            enum: [
              'summarizeEnabled',
              'toolsMenuEnabled',
              'forkEnabled',
              'regenerateEnabled',
              'feedbackEnabled',
              'copyEnabled',
              'editEnabled',
              'continueEnabled',
              'balanceEnabled',
              'toolCallDetailsEnabled',
              'showBirthdayIcon',
              'sharePointFilePickerEnabled',
              'customFooter',
            ],
          },
          value: { description: 'boolean or string (for customFooter)' },
        },
        required: ['key', 'value'],
      },
    },
  );

  return {
    [Tools.sys_admin_help]: helpTool,
    [Tools.sys_admin_search]: searchTool,
    [Tools.sys_admin_list_users]: listUsersTool,
    [Tools.sys_admin_get_user]: getUserTool,
    [Tools.sys_admin_create_user]: createUserTool,
    [Tools.sys_admin_update_user]: updateUserTool,
    [Tools.sys_admin_delete_user]: deleteUserTool,
    [Tools.sys_admin_ban_user]: banUserTool,
    [Tools.sys_admin_unban_user]: unbanUserTool,
    [Tools.sys_admin_grant_agent_access]: grantAgentAccessTool,
    [Tools.sys_admin_revoke_agent_access]: revokeAgentAccessTool,
    [Tools.sys_admin_invite_user]: inviteUserTool,
    [Tools.sys_admin_send_password_reset]: sendPasswordResetTool,
    [Tools.sys_admin_list_workspaces]: listWorkspacesTool,
    [Tools.sys_admin_get_workspace]: getWorkspaceTool,
    [Tools.sys_admin_create_workspace]: createWorkspaceTool,
    [Tools.sys_admin_update_workspace]: updateWorkspaceTool,
    [Tools.sys_admin_delete_workspace]: deleteWorkspaceTool,
    [Tools.sys_admin_list_workspace_members]: listWorkspaceMembersTool,
    [Tools.sys_admin_invite_workspace_member]: inviteWorkspaceMemberTool,
    [Tools.sys_admin_remove_workspace_member]: removeWorkspaceMemberTool,
    [Tools.sys_admin_get_user_usage]: getUserUsageTool,
    [Tools.sys_admin_get_user_balance]: getUserBalanceTool,
    [Tools.sys_admin_list_usage]: listUsageTool,
    [Tools.sys_admin_usage_aggregate]: usageAggregateTool,
    [Tools.sys_admin_list_agents]: listAgentsTool,
    [Tools.sys_admin_list_assignable_tools]: listAssignableToolsTool,
    [Tools.sys_admin_get_agent]: getAgentTool,
    [Tools.sys_admin_create_agent]: createAgentTool,
    [Tools.sys_admin_update_agent]: updateAgentTool,
    [Tools.sys_admin_delete_agent]: deleteAgentTool,
    [Tools.sys_admin_duplicate_agent]: duplicateAgentTool,
    [Tools.sys_admin_list_agent_versions]: listAgentVersionsTool,
    [Tools.sys_admin_revert_agent_version]: revertAgentVersionTool,
    [Tools.sys_admin_seed_system_agents]: seedSystemAgentsTool,
    [Tools.sys_admin_tail_logs]: tailLogsTool,
    [Tools.sys_admin_list_env]: listEnvTool,
    [Tools.sys_admin_search_event_logs]: searchEventLogsTool,
    [Tools.sys_admin_list_all_tools]: listAllToolsTool,
    [Tools.sys_admin_create_tool_override]: createToolOverrideTool,
    [Tools.sys_admin_get_tool_override]: getToolOverrideTool,
    [Tools.sys_admin_update_tool_override]: updateToolOverrideTool,
    [Tools.sys_admin_delete_tool_override]: deleteToolOverrideTool,
    [Tools.sys_admin_list_tool_overrides]: listToolOverridesTool,
    [Tools.sys_admin_list_feature_flags]: listFeatureFlagsTool,
    [Tools.sys_admin_set_feature_flag]: setFeatureFlagTool,
  };
}

module.exports = { createSysAdminTools };
