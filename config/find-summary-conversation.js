#!/usr/bin/env node
/**
 * Find conversation ID(s) that contain a "[Conversation summary]" message.
 * Useful for debugging the summarize-thread feature.
 *
 * Run: node config/find-summary-conversation.js
 * Or:  MONGO_URI=... node config/find-summary-conversation.js
 */
const path = require('path');
const mongoose = require('mongoose');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { Message } = require('@librechat/data-schemas').createModels(mongoose);
const connect = require('./connect');

(async () => {
  await connect();

  const summaries = await Message.find({
    sender: 'System',
    text: { $regex: /\[Conversation summary\]/ },
  })
    .select('conversationId messageId user text createdAt')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  if (summaries.length === 0) {
    console.log('No conversation summaries found.');
    process.exit(0);
  }

  console.log(`Found ${summaries.length} summary message(s):\n`);
  for (const s of summaries) {
    const preview = (s.text || '').slice(0, 120).replace(/\n/g, ' ');
    console.log('conversationId:', s.conversationId);
    console.log('  messageId:', s.messageId);
    console.log('  user:', s.user);
    console.log('  createdAt:', s.createdAt);
    console.log('  preview:', preview + (s.text?.length > 120 ? '...' : ''));
    console.log('');
  }

  process.exit(0);
})();

process.on('uncaughtException', (err) => {
  console.error(err);
  process.exit(1);
});
