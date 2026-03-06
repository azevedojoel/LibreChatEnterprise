/**
 * LangChain tools for Alex (human-in-the-loop agent).
 * Used when Ellis or another agent transfers to Alex for real-person actions.
 */
const { tool } = require('@langchain/core/tools');
const { Tools } = require('librechat-data-provider');
const {
  getWorkspaceById,
  setRoutingRule,
  deleteRoutingRule,
  isWorkspaceAdmin,
  getWorkspaceAdminId,
} = require('~/models/Workspace');
const { inviteUserToWorkspace } = require('~/server/services/WorkspaceInvite/inviteUser');
const { sendInboundReply } = require('~/server/services/sendInboundReply');
const { listInvitesByWorkspace, markExpiredInvites } = require('~/models/Invite');
const { createNotification } = require('~/server/services/NotificationService');

/**
 * @param {Object} params
 * @param {string} params.userId - User ID (for workspace lookup)
 * @param {string} [params.workspaceId] - Workspace ID (from user.workspace_id)
 * @param {string} [params.conversationId]
 * @param {string} [params.agentId]
 * @returns {Record<string, import('@langchain/core/tools').StructuredTool>}
 */
function createHumanTools({ userId, workspaceId, conversationId, agentId }) {
  const toJson = (obj) => (typeof obj === 'string' ? obj : JSON.stringify(obj ?? null));

  const requireWorkspace = () => {
    if (!workspaceId) {
      return {
        error:
          'Human tools require a workspace. The user must be assigned to a workspace.',
      };
    }
    return null;
  };

  const listWorkspaceMembersTool = tool(
    async () => {
      const err = requireWorkspace();
      if (err) return toJson(err);
      try {
        const User = require('~/db/models').User;
        const members = await User.find({ workspace_id: workspaceId })
          .select('_id email name username role')
          .lean();

        const sanitized = members.map((u) => ({
          id: u._id?.toString(),
          email: u.email,
          name: u.name,
          username: u.username,
          role: u.role,
        }));

        await markExpiredInvites(workspaceId);
        const [pendingInvites, expiredInvites] = await Promise.all([
          listInvitesByWorkspace(workspaceId, { status: 'pending', limit: 50 }),
          listInvitesByWorkspace(workspaceId, { status: 'expired', limit: 50 }),
        ]);
        const invites = [...pendingInvites, ...expiredInvites].map((inv) => ({
          id: inv.id ?? inv._id?.toString(),
          email: inv.email,
          status: inv.status,
          expiresAt: inv.expiresAt,
          createdAt: inv.createdAt,
        }));

        return toJson({ members: sanitized, invites });
      } catch (e) {
        return toJson({ error: e.message || 'Failed to list workspace members' });
      }
    },
    {
      name: Tools.human_list_workspace_members,
      description:
        'List all members and pending/expired invites in the current user\'s workspace. Returns members (id, email, name, username, role) and invites (email, status, expiresAt). Excludes accepted invites (those users are already members).',
      schema: { type: 'object', properties: {}, required: [] },
    },
  );

  const routingRulesListTool = tool(
    async () => {
      const err = requireWorkspace();
      if (err) return toJson(err);
      try {
        const workspace = await getWorkspaceById(workspaceId, 'name slug routingRules');
        if (!workspace) return toJson({ error: 'Workspace not found' });

        const rules = workspace.routingRules || [];
        if (rules.length === 0) {
          return toJson({ rules: [], message: 'No routing rules configured. Use human_routing_rules_set to add rules.' });
        }

        const User = require('~/db/models').User;
        const rulesWithNames = await Promise.all(
          rules.map(async (r) => {
            const member = await User.findById(r.memberId).select('name email').lean();
            return {
              trigger: r.topic,
              recipient: r.memberId?.toString(),
              recipientName: member?.name || member?.email || 'Unknown',
              instructions: r.instructions || null,
            };
          }),
        );

        return toJson({ rules: rulesWithNames });
      } catch (e) {
        return toJson({ error: e.message || 'Failed to list routing rules' });
      }
    },
    {
      name: Tools.human_routing_rules_list,
      description:
        'List routing rules for the workspace: who handles what (e.g. commercial auto → Chris). Returns trigger, recipient, recipientName, instructions for each rule.',
      schema: { type: 'object', properties: {}, required: [] },
    },
  );

  const routingRulesSetTool = tool(
    async (rawInput) => {
      const err = requireWorkspace();
      if (err) return toJson(err);
      const { trigger, recipient, instructions } = rawInput;
      if (!trigger) return toJson({ error: 'trigger is required' });
      if (!recipient) return toJson({ error: 'recipient is required (user ID from human_list_workspace_members)' });

      try {
        const User = require('~/db/models').User;
        const targetUser = await User.findById(recipient).select('_id workspace_id').lean();
        if (!targetUser) return toJson({ error: 'Recipient not found' });
        if (targetUser.workspace_id?.toString() !== workspaceId) {
          return toJson({ error: 'Recipient must be a member of this workspace' });
        }

        const workspace = await setRoutingRule(workspaceId, trigger.trim(), recipient, instructions);
        if (!workspace) return toJson({ error: 'Failed to set routing rule' });

        const rule = (workspace.routingRules || []).find((r) => r.topic === trigger.trim());
        return toJson({
          success: true,
          rule: rule
            ? {
                trigger: rule.topic,
                recipient: rule.memberId?.toString(),
                instructions: rule.instructions || null,
              }
            : null,
          message: `Routing rule set: "${trigger.trim()}" → ${targetUser._id}`,
        });
      } catch (e) {
        return toJson({ error: e.message || 'Failed to set routing rule' });
      }
    },
    {
      name: Tools.human_routing_rules_set,
      description:
        'Create or update a routing rule. Required: trigger (e.g. "commercial auto"), recipient (user ID from human_list_workspace_members). Optional: instructions (context for the human when routed).',
      schema: {
        type: 'object',
        properties: {
          trigger: { type: 'string', description: 'Topic/trigger (e.g. "commercial auto", "new leads")' },
          recipient: { type: 'string', description: 'User ID of the workspace member who handles this' },
          instructions: { type: 'string', description: 'Optional instructions for the human when they receive this' },
        },
        required: ['trigger', 'recipient'],
      },
    },
  );

  const routingRulesDeleteTool = tool(
    async (rawInput) => {
      const err = requireWorkspace();
      if (err) return toJson(err);
      const { trigger } = rawInput;
      if (!trigger) return toJson({ error: 'trigger is required' });

      try {
        const workspace = await deleteRoutingRule(workspaceId, trigger);
        if (!workspace) return toJson({ error: 'Failed to delete routing rule' });
        return toJson({
          success: true,
          message: `Routing rule removed: "${String(trigger).trim()}"`,
        });
      } catch (e) {
        return toJson({ error: e.message || 'Failed to delete routing rule' });
      }
    },
    {
      name: Tools.human_routing_rules_delete,
      description: 'Remove a routing rule by trigger. Required: trigger (the topic to remove).',
      schema: {
        type: 'object',
        properties: {
          trigger: { type: 'string', description: 'Topic/trigger to remove (e.g. "commercial auto")' },
        },
        required: ['trigger'],
      },
    },
  );

  const notifyHumanTool = tool(
    async (rawInput) => {
      const err = requireWorkspace();
      if (err) return toJson(err);
      const { memberId, message, context } = rawInput;
      if (!memberId) return toJson({ error: 'memberId is required' });
      if (!message) return toJson({ error: 'message is required' });

      try {
        const User = require('~/db/models').User;
        const targetUser = await User.findById(memberId)
          .select('_id email name workspace_id')
          .lean();

        if (!targetUser) return toJson({ error: 'Member not found' });
        if (targetUser.workspace_id?.toString() !== workspaceId) {
          return toJson({ error: 'Member is not in this workspace' });
        }

        const notificationText = context
          ? `**[Human]** Notifying ${targetUser.name || targetUser.email}: ${message}\n\nContext: ${context}`
          : `**[Human]** Notifying ${targetUser.name || targetUser.email}: ${message}`;

        const subject =
          message.length > 50 ? `[Human] ${message.slice(0, 47)}...` : `[Human] ${message}`;
        const bodyParts = [message];
        if (context) bodyParts.push(`\nContext: ${context}`);
        const appName = process.env.APP_TITLE || 'Daily Thread';
        const targetIsOwner = targetUser._id?.toString() === userId;
        let convUrl = null;
        if (conversationId && targetIsOwner) {
          const baseUrl = process.env.DOMAIN_CLIENT || process.env.DOMAIN_SERVER || 'http://localhost:3080';
          convUrl = `${baseUrl}/c/${conversationId}`;
          bodyParts.push(`\n\nReply in ${appName} to continue the conversation.`);
          bodyParts.push(`\n\nOpen conversation: ${convUrl}`);
        } else {
          bodyParts.push(`\n\nContact the conversation owner if you need to respond.`);
        }
        const body = bodyParts.join('');

        let html = null;
        const escapedMessage = (message || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const escapedContext = context ? (context || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';
        if (convUrl) {
          html = `<p>${escapedMessage}</p>${escapedContext ? `<p><strong>Context:</strong><br>${escapedContext}</p>` : ''}<p>Reply in ${appName} to continue the conversation.</p><p><a href="${convUrl}">Open conversation</a></p>`;
        } else {
          html = `<p>${escapedMessage}</p>${escapedContext ? `<p><strong>Context:</strong><br>${escapedContext}</p>` : ''}<p>Contact the conversation owner if you need to respond.</p>`;
        }

        const emailResult = await sendInboundReply({
          to: targetUser.email,
          subject,
          body,
          html,
        });

        const targetMemberId = targetUser._id?.toString();
        const conversationLink = conversationId ? `/c/${conversationId}` : undefined;
        await createNotification({
          userId: targetMemberId,
          type: 'human_notify',
          title: 'Team member notification',
          body: message,
          link: targetIsOwner ? conversationLink : undefined,
          metadata: { conversationId: conversationId || undefined, context: context || undefined },
        }).catch(() => {});

        if (emailResult.success) {
          return toJson({
            success: true,
            notification: notificationText,
            targetMember: {
              id: targetUser._id?.toString(),
              name: targetUser.name,
              email: targetUser.email,
            },
            emailSent: true,
            message: `Email sent to ${targetUser.email}. The human has been notified (they do not get access to this conversation).`,
          });
        }

        return toJson({
          success: true,
          notification: notificationText,
          targetMember: {
            id: targetUser._id?.toString(),
            name: targetUser.name,
            email: targetUser.email,
          },
          emailSent: false,
          emailError: emailResult.error,
          message:
            emailResult.error === 'Postmark not configured'
              ? 'Email not sent. Postmark not configured (POSTMARK_API_KEY). The notification appears in this conversation.'
              : `Email not sent: ${emailResult.error}. The notification appears in this conversation.`,
        });
      } catch (e) {
        return toJson({ error: e.message || 'Failed to notify human' });
      }
    },
    {
      name: Tools.human_notify_human,
      description:
        'Send a notification email to a workspace member (FYI, no approval needed). Required: memberId, message. Optional: context. The recipient gets the message and context in the email but does NOT get access to this conversation—only the conversation owner can open it. Use this only when you do NOT need to wait for approval—if you need approval, use human_await_response instead (it sends the notification).',
      schema: {
        type: 'object',
        properties: {
          memberId: { type: 'string', description: 'User ID of the workspace member to notify' },
          message: { type: 'string', description: 'The notification message' },
          context: { type: 'string', description: 'Additional context for the human' },
        },
        required: ['memberId', 'message'],
      },
    },
  );

  // For destructive tools, the runtime intercepts before execution and uses requestToolConfirmation.
  // This body runs only after approval; when denied, the tool is never invoked.
  const awaitResponseTool = tool(
    async (rawInput) => {
      const err = requireWorkspace();
      if (err) return toJson(err);
      return toJson({
        approved: true,
        message: 'Human approved. The conversation will continue.',
      });
    },
    {
      name: Tools.human_await_response,
      description:
        'Block until a human approves. Sends them an approval email—do NOT call human_notify_human first. Use memberId to route to a specific workspace member; omit for conversation owner to approve inline. Optional: message (context shown in approval request).',
      schema: {
        type: 'object',
        properties: {
          memberId: { type: 'string', description: 'User ID of the workspace member who must approve (receives email)' },
          message: { type: 'string', description: 'Instruction or context for the human (shown in approval request)' },
        },
        required: [],
      },
    },
  );

  const inviteToWorkspaceTool = tool(
    async (rawInput) => {
      const err = requireWorkspace();
      if (err) return toJson(err);
      const { email } = rawInput;
      if (!email || !String(email).trim()) {
        return toJson({ error: 'email is required' });
      }

      try {
        const workspace = await getWorkspaceById(workspaceId, 'maxMembers adminIds createdBy');
        if (!workspace) return toJson({ error: 'Workspace not found' });

        if (!isWorkspaceAdmin(workspace, userId)) {
          const adminMemberId = getWorkspaceAdminId(workspace);
          return toJson({
            error:
              'Only workspace admins can invite. Use human_notify_human to notify the workspace admin to invite them.',
            adminMemberId: adminMemberId || undefined,
          });
        }

        const result = await inviteUserToWorkspace({
          workspaceId,
          email: String(email).trim(),
          invitedBy: userId,
        });

        if (!result.success) {
          return toJson({ error: result.error || 'Failed to invite user' });
        }

        return toJson({
          success: true,
          message: result.message,
          link: result.link,
          user: result.user,
        });
      } catch (e) {
        return toJson({ error: e.message || 'Failed to invite user' });
      }
    },
    {
      name: Tools.human_invite_to_workspace,
      description:
        'Invite a user to the workspace by email. Only workspace admins can invite. If you get an error that you are not an admin, use human_notify_human to ask the workspace admin (adminMemberId) to invite them. Required: email.',
      schema: {
        type: 'object',
        properties: {
          email: { type: 'string', description: 'Email address of the user to invite' },
        },
        required: ['email'],
      },
    },
  );

  const removeFromWorkspaceTool = tool(
    async (rawInput) => {
      const err = requireWorkspace();
      if (err) return toJson(err);
      const { memberId } = rawInput;
      if (!memberId) return toJson({ error: 'memberId is required' });

      try {
        const workspace = await getWorkspaceById(workspaceId, 'adminIds createdBy');
        if (!workspace) return toJson({ error: 'Workspace not found' });

        if (!isWorkspaceAdmin(workspace, userId)) {
          const adminMemberId = getWorkspaceAdminId(workspace);
          return toJson({
            error:
              'Only workspace admins can remove members. Use human_notify_human to ask the workspace admin.',
            adminMemberId: adminMemberId || undefined,
          });
        }

        const targetId = String(memberId).trim();
        const currentUserId = String(userId);
        if (targetId === currentUserId) {
          return toJson({ error: 'Cannot remove yourself from the workspace.' });
        }

        const User = require('~/db/models').User;
        const result = await User.updateOne(
          { _id: targetId, workspace_id: workspaceId },
          { $unset: { workspace_id: '' } },
        );

        if (result.modifiedCount === 0) {
          return toJson({
            error: 'User not found in this workspace or invalid memberId.',
          });
        }

        return toJson({
          success: true,
          message: 'Member removed from workspace',
        });
      } catch (e) {
        return toJson({ error: e.message || 'Failed to remove member' });
      }
    },
    {
      name: Tools.human_remove_from_workspace,
      description:
        'Remove a member from the workspace. Only workspace admins can remove. Cannot remove yourself. Required: memberId (user ID from human_list_workspace_members).',
      schema: {
        type: 'object',
        properties: {
          memberId: { type: 'string', description: 'User ID of the workspace member to remove' },
        },
        required: ['memberId'],
      },
    },
  );

  return {
    [Tools.human_list_workspace_members]: listWorkspaceMembersTool,
    [Tools.human_routing_rules_list]: routingRulesListTool,
    [Tools.human_routing_rules_set]: routingRulesSetTool,
    [Tools.human_routing_rules_delete]: routingRulesDeleteTool,
    [Tools.human_notify_human]: notifyHumanTool,
    [Tools.human_await_response]: awaitResponseTool,
    [Tools.human_invite_to_workspace]: inviteToWorkspaceTool,
    [Tools.human_remove_from_workspace]: removeFromWorkspaceTool,
  };
}

module.exports = { createHumanTools };
