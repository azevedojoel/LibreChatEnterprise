const { Tool } = require('@langchain/core/tools');
const { getEnvironmentVariable } = require('@langchain/core/utils/env');
const fetch = require('node-fetch');
const { getUserById } = require('~/models');
const { formatEmailContent } = require('~/server/utils/formatEmailHighlights');

const postmarkSendUserEmailSchema = {
  type: 'object',
  properties: {
    subject: {
      type: 'string',
      description: 'Email subject line.',
    },
    body: {
      type: 'string',
      description: 'Body of the email. Supports markdown (headers, lists, code blocks, links).',
    },
    html_body: {
      type: 'string',
      description:
        'Deprecated. Ignored when formatting is applied. HTML and plain text are generated from body.',
    },
    from: {
      type: 'string',
      description:
        'Optional sender address override. Must be a registered Postmark sender. Defaults to POSTMARK_FROM or EMAIL_FROM env.',
    },
  },
  required: ['subject', 'body'],
};

class PostmarkSendUserEmail extends Tool {
  name = 'send_user_email';
  description =
    'Send an email to the current user via Postmark. The email is always sent to the logged-in user\'s address. ' +
    'Provide subject and body (markdown supported). Do NOT ask for or include a recipient—the system uses the user\'s account email automatically.';

  schema = postmarkSendUserEmailSchema;

  static get jsonSchema() {
    return postmarkSendUserEmailSchema;
  }

  constructor(fields = {}) {
    super();
    this.envVar = 'POSTMARK_API_KEY';
    this.override = fields.override ?? false;
    this.apiKey = fields[this.envVar] ?? this.getApiKey();
    this.defaultFrom =
      fields.POSTMARK_FROM ?? fields.EMAIL_FROM ?? this.getDefaultFrom();
    this.userId = fields.userId;
  }

  getApiKey() {
    const key = getEnvironmentVariable(this.envVar);
    if (!key && !this.override) {
      throw new Error(`Missing ${this.envVar} environment variable.`);
    }
    return key || '';
  }

  getDefaultFrom() {
    return (
      getEnvironmentVariable('POSTMARK_FROM') ||
      getEnvironmentVariable('EMAIL_FROM') ||
      'noreply@example.com'
    );
  }

  async _call(args) {
    try {
      const { subject, body, from } = args;
      const fromAddress = from || this.defaultFrom;

      if (!this.userId) {
        return 'Error: User context not available. Cannot determine recipient.';
      }

      const user = await getUserById(this.userId, 'email');
      if (!user?.email) {
        return 'Error: User has no email address on file.';
      }

      const contentParts = [{ type: 'text', text: body || '' }];
      const appName = process.env.APP_TITLE || 'LibreChat';
      const { html, text } = formatEmailContent(contentParts, [], { appName });

      const payload = {
        From: fromAddress,
        To: user.email,
        Subject: subject,
        TextBody: text || '(No content)',
        HtmlBody: html || null,
      };

      const res = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': this.apiKey,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        return `Error: Postmark API failed (${res.status}): ${data.Message || JSON.stringify(data)}`;
      }

      return JSON.stringify({
        success: true,
        messageId: data.MessageID,
        submittedAt: data.SubmittedAt,
        to: data.To,
      });
    } catch (err) {
      return `Error: ${err.message}`;
    }
  }
}

module.exports = PostmarkSendUserEmail;
