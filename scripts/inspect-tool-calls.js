#!/usr/bin/env node
/**
 * Inspect tool_call parts in messages for a conversation.
 * Usage: node scripts/inspect-tool-calls.js <conversationId>
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
require('module-alias/register');
require('module-alias').addAlias('~', path.resolve(__dirname, '..', 'api'));

const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');

const conversationId = process.argv[2] || '76e0f195-d4e9-4559-8db8-d317a61577a7';

function getToolCall(part) {
  if (!part) return null;
  const tc = part.tool_call ?? part['tool_call'];
  return tc ?? null;
}

function wouldShowCancelled(tc, name) {
  if (!tc) return null;
  const isToolSearch = name === 'tool_search' || (typeof name === 'string' && name.startsWith('tool_search_mcp_'));
  if (isToolSearch) return false; // UI always masks tool_search as non-cancelled
  const hasOutput = tc.output != null && tc.output !== '';
  if (hasOutput) return false;
  const progress = tc.progress ?? 0.1;
  // wouldBeCancelled when: !isSubmitting && progress < 1 && !gracePeriodActive
  // For stored data, isSubmitting is always false - so if progress < 1 and no output, shows Cancelled
  return progress < 1;
}

async function main() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('MONGO_URI not set. Check .env');
    process.exit(1);
  }

  createModels(mongoose);
  await mongoose.connect(MONGO_URI);
  const Message = mongoose.models.Message;

  const messages = await Message.find({ conversationId })
    .sort({ createdAt: 1 })
    .lean();

  if (!messages.length) {
    console.log(`No messages found for conversation ${conversationId}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`\n=== Tool calls in conversation ${conversationId} ===\n`);
  console.log(`Total messages: ${messages.length}\n`);

  let toolCount = 0;
  let cancelledCount = 0;

  for (const msg of messages) {
    const content = msg.content ?? [];
    const toolParts = content
      .map((p, i) => (p && (p.tool_call != null || p['tool_call'] != null) ? { part: p, idx: i } : null))
      .filter(Boolean);

    if (toolParts.length === 0) continue;

    for (const { part, idx } of toolParts) {
      const tc = getToolCall(part);
      if (!tc) continue;
      toolCount++;
      const name = tc.name ?? 'unknown';
      const progress = tc.progress;
      const hasOutput = tc.output != null && tc.output !== '';
      const outputPreview = hasOutput ? (typeof tc.output === 'string' ? tc.output.slice(0, 80) + '...' : '[object]') : '(none)';
      const cancelled = wouldShowCancelled(tc, name);
      if (cancelled) cancelledCount++;

      console.log(`Message: ${msg.messageId} (${msg.isCreatedByUser ? 'user' : 'assistant'})`);
      console.log(`  Tool [${idx}]: ${name}`);
      console.log(`    progress: ${progress ?? '(undefined)'}`);
      console.log(`    output: ${hasOutput ? 'yes' : 'NO'}`);
      console.log(`    output preview: ${outputPreview}`);
      console.log(`    UI would show: ${cancelled ? '*** CANCELLED ***' : 'Completed'}`);
      console.log('');
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total tool calls: ${toolCount}`);
  console.log(`Would show Cancelled in UI: ${cancelledCount}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
