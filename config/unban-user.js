/**
 * Unban a user by email, or clear ALL bans (including IP-based).
 *
 * Usage: node config/unban-user.js <email>
 *        node config/unban-user.js --all    # Clear ALL bans (fixes IP-based bans)
 *        npm run unban-user -- <email>
 *        npm run unban-user -- --all
 */
const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { Keyv } = require('keyv');
const { ViolationTypes } = require('librechat-data-provider');
const { isEnabled, keyvMongo } = require('@librechat/api');
const connect = require('./connect');
const { getLogStores } = require('~/cache');
const { findUser } = require('~/models');

const unbanCache = new Keyv({ store: keyvMongo, namespace: ViolationTypes.BAN, ttl: 0 });

async function clearAllBans() {
  await connect();

  const banLogs = getLogStores(ViolationTypes.BAN);
  await banLogs.clear();
  console.log('Cleared all entries from ban logs');

  await unbanCache.clear();
  console.log('Cleared all entries from ban cache');

  console.log('\nAll bans have been cleared. You can log in now.');
  process.exit(0);
}

async function unbanUser(email) {
  await connect();

  const user = await findUser({ email }, '_id');
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  const userId = user._id.toString();

  const banLogs = getLogStores(ViolationTypes.BAN);
  await banLogs.delete(userId);
  console.log(`Deleted ban from ban logs for user ${userId}`);

  const userKey = isEnabled(process.env.USE_REDIS) ? `ban_cache:user:${userId}` : userId;
  await unbanCache.delete(userKey);
  console.log(`Deleted ban cache for user ${userId}`);

  console.log(`\nUser ${email} (${userId}) has been unbanned.`);
  console.log('If you still get "banned" on login, run: npm run unban-user -- --all');
  process.exit(0);
}

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node config/unban-user.js <email>');
  console.error('       node config/unban-user.js --all  (clear ALL bans, including IP-based)');
  process.exit(1);
}

if (arg === '--all') {
  clearAllBans().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
} else {
  unbanUser(arg).catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
