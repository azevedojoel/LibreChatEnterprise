const path = require('path');
const fetch = require('node-fetch');
const axios = require('axios');
const FormData = require('form-data');
const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const { logger } = require('@librechat/data-schemas');
const { logAxiosError, isEnabled, readFileAsString } = require('@librechat/api');
const { logEmailSent } = require('~/server/services/EventLogService');

/**
 * Sends an email using Postmark API.
 *
 * @async
 * @function sendEmailViaPostmark
 * @param {Object} params - The parameters for sending the email.
 * @param {string} params.to - The recipient's email address.
 * @param {string} params.from - The sender's email address.
 * @param {string} params.subject - The subject of the email.
 * @param {string} params.html - The HTML content of the email.
 * @returns {Promise<Object>} - A promise that resolves to the response from Postmark API.
 */
const sendEmailViaPostmark = async ({ to, from, subject, html }) => {
  const apiKey = process.env.POSTMARK_API_KEY;

  if (!apiKey) {
    throw new Error('Postmark API key (POSTMARK_API_KEY) is required');
  }

  const payload = {
    From: from,
    To: to,
    Subject: subject,
    HtmlBody: html,
    TextBody:
      html
        ?.replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || '(No content)',
  };

  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': apiKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.Message || `Postmark API failed (${res.status})`);
  }

  return data;
};

/**
 * Sends an email using Mailgun API.
 *
 * @async
 * @function sendEmailViaMailgun
 * @param {Object} params - The parameters for sending the email.
 * @param {string} params.to - The recipient's email address.
 * @param {string} params.from - The sender's email address.
 * @param {string} params.subject - The subject of the email.
 * @param {string} params.html - The HTML content of the email.
 * @returns {Promise<Object>} - A promise that resolves to the response from Mailgun API.
 */
const sendEmailViaMailgun = async ({ to, from, subject, html }) => {
  const mailgunApiKey = process.env.MAILGUN_API_KEY;
  const mailgunDomain = process.env.MAILGUN_DOMAIN;
  const mailgunHost = process.env.MAILGUN_HOST || 'https://api.mailgun.net';

  if (!mailgunApiKey || !mailgunDomain) {
    throw new Error('Mailgun API key and domain are required');
  }

  const formData = new FormData();
  formData.append('from', from);
  formData.append('to', to);
  formData.append('subject', subject);
  formData.append('html', html);
  formData.append('o:tracking-clicks', 'no');

  try {
    const response = await axios.post(`${mailgunHost}/v3/${mailgunDomain}/messages`, formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Basic ${Buffer.from(`api:${mailgunApiKey}`).toString('base64')}`,
      },
    });

    return response.data;
  } catch (error) {
    throw new Error(logAxiosError({ error, message: 'Failed to send email via Mailgun' }));
  }
};

/**
 * Sends an email using SMTP via Nodemailer.
 *
 * @async
 * @function sendEmailViaSMTP
 * @param {Object} params - The parameters for sending the email.
 * @param {Object} params.transporterOptions - The transporter configuration options.
 * @param {Object} params.mailOptions - The email options.
 * @returns {Promise<Object>} - A promise that resolves to the info object of the sent email.
 */
const sendEmailViaSMTP = async ({ transporterOptions, mailOptions }) => {
  const transporter = nodemailer.createTransport(transporterOptions);
  return await transporter.sendMail(mailOptions);
};

/**
 * Sends an email using the specified template, subject, and payload.
 *
 * @async
 * @function sendEmail
 * @param {Object} params - The parameters for sending the email.
 * @param {string} params.email - The recipient's email address.
 * @param {string} params.subject - The subject of the email.
 * @param {Record<string, string>} params.payload - The data to be used in the email template.
 * @param {string} params.template - The filename of the email template.
 * @param {boolean} [throwError=true] - Whether to throw an error if the email sending process fails.
 * @param {Object} [params.auditContext] - Optional audit context for EventLog
 * @param {string} [params.auditContext.userId] - User ID of actor/recipient
 * @param {string} [params.auditContext.agentId]
 * @param {string} [params.auditContext.conversationId]
 * @param {string} [params.auditContext.scheduleId]
 * @param {string} [params.auditContext.source]
 * @returns {Promise<Object>} - A promise that resolves to the info object of the sent email or the error if sending the email fails.
 *
 * @example
 * const emailData = {
 *   email: 'recipient@example.com',
 *   subject: 'Welcome!',
 *   payload: { name: 'Recipient' },
 *   template: 'welcome.html'
 * };
 *
 * sendEmail(emailData)
 *   .then(info => console.log('Email sent:', info))
 *   .catch(error => console.error('Error sending email:', error));
 *
 * @throws Will throw an error if the email sending process fails and throwError is `true`.
 */
const sendEmail = async ({
  email,
  subject,
  payload,
  template,
  throwError = true,
  auditContext,
}) => {
  const hasPostmark =
    process.env.POSTMARK_API_KEY && (process.env.POSTMARK_FROM || process.env.EMAIL_FROM);
  const hasMailgun = process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN;
  let provider = 'smtp';
  if (hasPostmark) provider = 'postmark';
  else if (hasMailgun) provider = 'mailgun';

  try {
    const { content: source } = await readFileAsString(path.join(__dirname, 'emails', template));
    const compiledTemplate = handlebars.compile(source);
    const html = compiledTemplate(payload);

    // Prepare common email data
    const fromName = process.env.EMAIL_FROM_NAME || process.env.APP_TITLE;
    const fromEmail = hasPostmark
      ? process.env.POSTMARK_FROM || process.env.EMAIL_FROM
      : process.env.EMAIL_FROM;
    const fromAddress = `"${fromName}" <${fromEmail}>`;
    const toAddress = payload?.name ? `"${payload.name}" <${email}>` : email;

    let result;

    if (hasPostmark) {
      logger.debug('[sendEmail] Using Postmark provider');
      result = await sendEmailViaPostmark({
        from: fromAddress,
        to: toAddress,
        subject: subject,
        html: html,
      });
    } else if (hasMailgun) {
      logger.debug('[sendEmail] Using Mailgun provider');
      result = await sendEmailViaMailgun({
        from: fromAddress,
        to: toAddress,
        subject: subject,
        html: html,
      });
    } else {
      // Default to SMTP
      logger.debug('[sendEmail] Using SMTP provider');
      const transporterOptions = {
        // Use STARTTLS by default instead of obligatory TLS
        secure: process.env.EMAIL_ENCRYPTION === 'tls',
        // If explicit STARTTLS is set, require it when connecting
        requireTls: process.env.EMAIL_ENCRYPTION === 'starttls',
        tls: {
          // Whether to accept unsigned certificates
          rejectUnauthorized: !isEnabled(process.env.EMAIL_ALLOW_SELFSIGNED),
        },
        auth: {
          user: process.env.EMAIL_USERNAME,
          pass: process.env.EMAIL_PASSWORD,
        },
      };

      if (process.env.EMAIL_ENCRYPTION_HOSTNAME) {
        // Check the certificate against this name explicitly
        transporterOptions.tls.servername = process.env.EMAIL_ENCRYPTION_HOSTNAME;
      }

      // Mailer service definition has precedence
      if (process.env.EMAIL_SERVICE) {
        transporterOptions.service = process.env.EMAIL_SERVICE;
      } else {
        transporterOptions.host = process.env.EMAIL_HOST;
        transporterOptions.port = process.env.EMAIL_PORT ?? 25;
      }

      const mailOptions = {
        // Header address should contain name-addr
        from: fromAddress,
        to: toAddress,
        envelope: {
          // Envelope from should contain addr-spec
          // Mistake in the Nodemailer documentation?
          from: fromEmail,
          to: email,
        },
        subject: subject,
        html: html,
      };

      result = await sendEmailViaSMTP({ transporterOptions, mailOptions });
    }

    if (auditContext?.userId) {
      await logEmailSent({
        userId: auditContext.userId,
        to: email,
        subject,
        provider,
        metadata: {
          agentId: auditContext.agentId,
          conversationId: auditContext.conversationId,
          scheduleId: auditContext.scheduleId,
          source: auditContext.source,
        },
        success: true,
      });
    }

    return result;
  } catch (error) {
    if (auditContext?.userId) {
      logEmailSent({
        userId: auditContext.userId,
        to: email,
        subject,
        provider,
        metadata: {
          agentId: auditContext.agentId,
          conversationId: auditContext.conversationId,
          scheduleId: auditContext.scheduleId,
          source: auditContext.source,
          errorMessage: error?.message,
        },
        success: false,
      }).catch((err) => logger.error('[sendEmail] Failed to persist audit:', err));
    }
    if (throwError) {
      throw error;
    }
    logger.error('[sendEmail]', error);
    return error;
  }
};

module.exports = sendEmail;
