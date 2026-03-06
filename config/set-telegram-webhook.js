#!/usr/bin/env node
/**
 * Register the Telegram webhook URL with the Telegram Bot API.
 * Run once after deployment. Requires TELEGRAM_BOT_TOKEN and INBOUND_TELEGRAM_PATH_SECRET.
 *
 * Usage: node config/set-telegram-webhook.js
 *   or:  TELEGRAM_BOT_TOKEN=xxx INBOUND_TELEGRAM_PATH_SECRET=yyy DOMAIN_SERVER=https://your-domain.com node config/set-telegram-webhook.js
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const token = process.env.TELEGRAM_BOT_TOKEN;
const pathSecret = process.env.INBOUND_TELEGRAM_PATH_SECRET;
const domainServer = process.env.DOMAIN_SERVER || process.env.DOMAIN_CLIENT || 'https://your-domain.com';
const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

if (!pathSecret) {
  console.error('Error: INBOUND_TELEGRAM_PATH_SECRET is required');
  process.exit(1);
}

const baseUrl = domainServer.replace(/\/$/, '');
const webhookUrl = `${baseUrl}/api/inbound/telegram/${pathSecret}`;

async function setWebhook() {
  const url = new URL(`https://api.telegram.org/bot${token}/setWebhook`);
  url.searchParams.set('url', webhookUrl);
  if (secretToken) {
    url.searchParams.set('secret_token', secretToken);
  }

  console.log('Setting Telegram webhook to:', webhookUrl);

  const res = await fetch(url.toString(), { method: 'GET' });
  const data = await res.json();

  if (!data.ok) {
    console.error('Failed to set webhook:', data.description);
    process.exit(1);
  }

  console.log('Webhook set successfully.');
}

setWebhook().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
