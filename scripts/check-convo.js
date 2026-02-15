#!/usr/bin/env node
/**
 * Quick script to inspect a conversation in the DB.
 * Usage: node scripts/check-convo.js <conversationId>
 *        npm run check-convo -- 2bed069d-b9c5-44fa-9548-49c1640747d9
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
require('module-alias/register');
require('module-alias').addAlias('~', path.resolve(__dirname, '..', 'api'));

const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');

const conversationId = process.argv[2] || '2bed069d-b9c5-44fa-9548-49c1640747d9';

async function main() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('MONGO_URI not set. Check .env');
    process.exit(1);
  }

  createModels(mongoose);
  await mongoose.connect(MONGO_URI);
  const Conversation = mongoose.models.Conversation;

  const convo = await Conversation.findOne({ conversationId }).lean();
  if (!convo) {
    console.log(`Conversation ${conversationId} NOT FOUND in DB.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('\n--- Conversation DB record ---\n');
  console.log(JSON.stringify({
    conversationId: convo.conversationId,
    title: convo.title,
    user: convo.user,
    endpoint: convo.endpoint,
    agent_id: convo.agent_id,
    model: convo.model,
    spec: convo.spec,
    iconURL: convo.iconURL,
    createdAt: convo.createdAt,
    updatedAt: convo.updatedAt,
  }, null, 2));
  console.log('\n--- Full document (keys) ---');
  console.log(Object.keys(convo).join(', '));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
