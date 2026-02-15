const { Tool } = require('@langchain/core/tools');
const { getEnvironmentVariable } = require('@langchain/core/utils/env');
const fetch = require('node-fetch');

const postmarkSendEmailSchema = {
  type: 'object',
  properties: {
    to: {
      type: 'string',
      description:
        'Recipient email address(es). For multiple recipients, use comma-separated values (e.g., "user1@example.com, user2@example.com").',
    },
    subject: {
      type: 'string',
      description: 'Email subject line.',
    },
    body: {
      type: 'string',
      description: 'Plain text body of the email.',
    },
    html_body: {
      type: 'string',
      description:
        'Optional HTML body. If provided, the email will be sent as multipart with both plain text and HTML.',
    },
    from: {
      type: 'string',
      description:
        'Optional sender address override. Must be a registered Postmark sender. Defaults to POSTMARK_FROM or EMAIL_FROM env.',
    },
    cc: {
      type: 'string',
      description: 'Optional CC recipient(s), comma-separated.',
    },
    bcc: {
      type: 'string',
      description: 'Optional BCC recipient(s), comma-separated.',
    },
  },
  required: ['to', 'subject', 'body'],
};

class PostmarkSendEmail extends Tool {
  name = 'send_email';
  description =
    'Send an email via Postmark. Requires POSTMARK_API_KEY in the environment. ' +
    'Provide recipient(s), subject, and body. Optionally include HTML body, CC, or BCC.';

  schema = postmarkSendEmailSchema;

  static get jsonSchema() {
    return postmarkSendEmailSchema;
  }

  constructor(fields = {}) {
    super();
    this.envVar = 'POSTMARK_API_KEY';
    this.override = fields.override ?? false;
    this.apiKey = fields[this.envVar] ?? this.getApiKey();
    this.defaultFrom =
      fields.POSTMARK_FROM ?? fields.EMAIL_FROM ?? this.getDefaultFrom();
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
      const { to, subject, body, html_body, from, cc, bcc } = args;
      const fromAddress = from || this.defaultFrom;

      const payload = {
        From: fromAddress,
        To: to,
        Subject: subject,
        TextBody: body,
      };
      if (html_body) {
        payload.HtmlBody = html_body;
      }
      if (cc) {
        payload.Cc = cc;
      }
      if (bcc) {
        payload.Bcc = bcc;
      }

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

module.exports = PostmarkSendEmail;
