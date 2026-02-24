#!/usr/bin/env node
/**
 * Quick script to inspect a conversation in the DB.
 * Usage: node scripts/check-convo.js <conversationId>
 *        node scripts/check-convo.js 09e0766c-2d0d-404f-b398-c65d6aa6d6f3
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
require('module-alias/register');
require('module-alias').addAlias('~', path.resolve(__dirname, '..', 'api'));

const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');

const conversationId = process.argv[2] || '09e0766c-2d0d-404f-b398-c65d6aa6d6f3';

function findDuplicateToolCallIds(messages) {
  const duplicates = [];
  for (const msg of messages) {
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
    const seen = new Map();
    for (let i = 0; i < msg.content.length; i++) {
      const part = msg.content[i];
      const tc = part?.tool_call ?? part?.toolCall;
      if (!tc?.id) continue;
      if (seen.has(tc.id)) {
        duplicates.push({
          messageId: msg.messageId,
          index: i,
          toolCallId: tc.id,
          name: tc.name,
          firstSeenAt: seen.get(tc.id),
        });
      } else {
        seen.set(tc.id, i);
      }
    }
  }
  return duplicates;
}

async function main() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('MONGO_URI not set. Check .env');
    process.exit(1);
  }

  createModels(mongoose);
  await mongoose.connect(MONGO_URI);
  const Conversation = mongoose.models.Conversation;
  const Message = mongoose.models.Message;

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

  const messages = await Message.find({ conversationId }).sort({ createdAt: 1 }).lean();
  console.log(`\n--- Messages (${messages.length} total) ---\n`);

  const duplicateToolIds = findDuplicateToolCallIds(messages);
  if (duplicateToolIds.length > 0) {
    console.log('*** DUPLICATE tool_call IDs FOUND (likely cause of tool_use error) ***\n');
    console.log(JSON.stringify(duplicateToolIds, null, 2));
  }

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const preview = {
      i,
      messageId: m.messageId?.slice(0, 8) + '...',
      role: m.role ?? m.sender,
      text: typeof m.text === 'string' ? m.text?.slice(0, 80) + (m.text?.length > 80 ? '...' : '') : '(no text)',
      contentParts: Array.isArray(m.content) ? m.content.length : 0,
    };
    if (Array.isArray(m.content)) {
      const toolCallIds = [];
      for (const part of m.content) {
        const tc = part?.tool_call ?? part?.toolCall;
        if (tc?.id) toolCallIds.push({ id: tc.id, name: tc.name });
      }
      if (toolCallIds.length > 0) {
        preview.toolCalls = toolCallIds;
      }
    }
    console.log(JSON.stringify(preview, null, 2));
  }

  console.log('\n--- Full message content (assistant messages with tool_calls) ---\n');
  for (const m of messages) {
    if (m.role !== 'assistant' && m.sender !== 'assistant') continue;
    if (!Array.isArray(m.content)) continue;
    const hasToolCalls = m.content.some((p) => (p?.tool_call ?? p?.toolCall)?.id);
    if (!hasToolCalls) continue;
    console.log(`Message ${m.messageId}:`);
    console.log(JSON.stringify(m.content, null, 2));
    console.log('');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
