/**
 * Resolves {{placeholder}} variables in a scheduled prompt template.
 * Supports: custom vars ({{varName}}), user fields ({{LIBRECHAT_USER_*}}),
 * body fields ({{LIBRECHAT_BODY_*}}), and scheduled-run context ({{runAt}}, {{date}}, {{time}}).
 *
 * @param {string} template - Prompt template (may contain {{var}} placeholders)
 * @param {Object} context
 * @param {Object} [context.user] - User object for {{LIBRECHAT_USER_ID}}, {{LIBRECHAT_USER_NAME}}, etc.
 * @param {Record<string, string>} [context.customUserVars] - Custom vars for {{varName}} placeholders
 * @param {Object} [context.body] - Request body for {{LIBRECHAT_BODY_CONVERSATIONID}}, etc.
 * @param {Date} [context.runAt] - Run time; exposed as {{runAt}}, {{date}}, {{time}}
 * @returns {string} Resolved prompt
 */
function resolveScheduledPrompt(template, context = {}) {
  if (typeof template !== 'string') {
    return String(template);
  }

  const { user, customUserVars = {}, body = {}, runAt } = context;
  let value = template;

  const customVars = { ...customUserVars };
  if (runAt instanceof Date) {
    customVars.runAt = runAt.toISOString();
    customVars.date = runAt.toLocaleDateString();
    customVars.time = runAt.toLocaleTimeString();
  }

  for (const [varName, varVal] of Object.entries(customVars)) {
    if (varName && varVal != null) {
      const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      value = value.replace(new RegExp(`\\{\\{${escaped}\\}\\}`, 'g'), String(varVal));
    }
  }

  const userFields = [
    'id',
    'name',
    'username',
    'email',
    'provider',
    'role',
    'googleId',
    'facebookId',
    'openidId',
    'samlId',
    'ldapId',
    'githubId',
    'discordId',
    'appleId',
    'emailVerified',
    'twoFactorEnabled',
    'termsAccepted',
  ];
  if (user && typeof user === 'object') {
    for (const field of userFields) {
      const placeholder = `{{LIBRECHAT_USER_${field.toUpperCase()}}}`;
      if (!value.includes(placeholder)) continue;
      const fieldValue = user[field];
      const replacement = fieldValue == null ? '' : String(fieldValue);
      const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      value = value.replace(new RegExp(escapedPlaceholder, 'g'), replacement);
    }
  }

  const bodyFields = ['conversationId', 'parentMessageId', 'messageId'];
  if (body && typeof body === 'object') {
    for (const field of bodyFields) {
      const placeholder = `{{LIBRECHAT_BODY_${field.toUpperCase()}}}`;
      if (!value.includes(placeholder)) continue;
      const fieldValue = body[field];
      const replacement = fieldValue == null ? '' : String(fieldValue);
      const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      value = value.replace(new RegExp(escapedPlaceholder, 'g'), replacement);
    }
  }

  if (/\$\{[A-Za-z_][A-Za-z0-9_]*\}/.test(value)) {
    value = value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => {
      return process.env[name] ?? '';
    });
  }

  return value;
}

module.exports = { resolveScheduledPrompt };
