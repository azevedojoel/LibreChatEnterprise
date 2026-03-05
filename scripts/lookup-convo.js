#!/usr/bin/env node
/**
 * Lookup a conversation and its messages by conversationId.
 * Usage: node scripts/lookup-convo.js <conversationId>
 * Run from project root with MONGO_URI set.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');

const conversationId = process.argv[2] || '82b4ce37-1d0c-4fd3-ad56-7757e26992d9';

async function main() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('MONGO_URI not set');
    process.exit(1);
  }

  const models = createModels(mongoose);
  const { Conversation, Message } = models;

  await mongoose.connect(MONGO_URI);

  const convo = await Conversation.findOne({ conversationId }).lean();
  if (!convo) {
    console.log('Conversation not found:', conversationId);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('\n=== Conversation ===');
  console.log(JSON.stringify(convo, null, 2));

  const messages = await Message.find({ conversationId }).sort({ createdAt: 1 }).lean();
  console.log('\n=== Messages (' + messages.length + ') ===');

  for (const m of messages) {
    // Full message for debugging - exclude huge fields if present
    const safe = { ...m };
    if (safe.text && safe.text.length > 500) safe.text = safe.text.substring(0, 500) + '...[truncated]';
    console.log(JSON.stringify(safe, null, 2));
    console.log('---');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
