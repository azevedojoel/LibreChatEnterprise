#!/usr/bin/env node
/**
 * Full analysis of a conversation: structure, context size, and subagent tool content.
 * Visualizes what gets sent to the LLM and to subagents.
 *
 * Usage: node scripts/analyze-conversation-context.js <conversationId>
 *        node scripts/analyze-conversation-context.js d2645a64-29bf-4536-b517-49f43888aaba
 *
 * Requires: MONGO_URI in .env
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
require('module-alias/register');
require('module-alias').addAlias('~', path.resolve(__dirname, '..', 'api'));

const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');
const { Constants } = require('librechat-data-provider');
const { getMessages } = require('~/models/Message');

/** Rough token estimate: ~4 chars per token for English (conservative) */
function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / 4);
}

/** Estimate tokens for a message (text + content parts) */
function estimateMessageTokens(msg) {
  let total = 0;
  if (msg.text && typeof msg.text === 'string') {
    total += estimateTokens(msg.text);
  }
  if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if (part?.type === 'text' && part?.text) total += estimateTokens(part.text);
      if (part?.type === 'tool_call' || part?.type === 'toolCall') {
        const tc = part.tool_call ?? part.toolCall;
        if (tc?.name) total += estimateTokens(tc.name);
        if (tc?.args) total += estimateTokens(JSON.stringify(tc.args));
        if (tc?.output != null) total += estimateTokens(String(tc.output));
      }
    }
  }
  return total;
}

/** Extract run_sub_agent tool calls and their prompt sizes */
function extractRunSubAgentCalls(messages) {
  const calls = [];
  for (const msg of messages) {
    if (!Array.isArray(msg.content)) continue;
    for (let i = 0; i < msg.content.length; i++) {
      const part = msg.content[i];
      const tc = part?.tool_call ?? part?.toolCall;
      if (!tc || !String(tc.name).startsWith('run_sub_agent')) continue;

      let args = tc.args;
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args);
        } catch {
          args = {};
        }
      }
      args = args ?? {};

      if (args.prompt) {
        const len = String(args.prompt).length;
        calls.push({
          messageId: msg.messageId,
          index: i,
          type: 'single',
          promptLength: len,
          promptChars: len,
          promptTokens: estimateTokens(args.prompt),
          agentId: args.agentId,
          truncated: len > 32 * 1024,
        });
      }
      if (Array.isArray(args.tasks)) {
        for (let t = 0; t < args.tasks.length; t++) {
          const task = args.tasks[t];
          const prompt = task?.prompt ?? '';
          const len = String(prompt).length;
          calls.push({
            messageId: msg.messageId,
            index: i,
            taskIndex: t,
            type: 'tasks',
            promptLength: len,
            promptChars: len,
            promptTokens: estimateTokens(prompt),
            agentId: task?.agentId,
            sequential: args.sequential === true,
            truncated: len > 32 * 1024,
          });
        }
      }
    }
  }
  return calls;
}

/** Build message tree for a given parent (like getMessagesForConversation) */
function getOrderedMessages(messages, parentMessageId) {
  const ordered = [];
  let currentId = parentMessageId;
  const visited = new Set();

  while (currentId) {
    if (visited.has(currentId)) break;
    const msg = messages.find((m) => (m.messageId ?? m.id) === currentId);
    if (!msg) break;
    visited.add(currentId);
    ordered.push(msg);
    currentId = msg.parentMessageId === Constants.NO_PARENT ? null : msg.parentMessageId;
  }
  ordered.reverse();
  return ordered;
}

/** Find leaf messages (latest in each branch) */
function findLeafMessageIds(messages) {
  const hasParent = new Set();
  for (const m of messages) {
    const pid = m.parentMessageId;
    if (pid && pid !== Constants.NO_PARENT) hasParent.add(pid);
  }
  return messages.filter((m) => !hasParent.has(m.messageId ?? m.id)).map((m) => m.messageId ?? m.id);
}

async function main() {
  const conversationId = process.argv[2] || 'd2645a64-29bf-4536-b517-49f43888aaba';
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
    console.log(`\nConversation ${conversationId} NOT FOUND in DB.\n`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const messages = await Message.find({ conversationId }).sort({ createdAt: 1 }).lean();
  const maxContextTokens = convo.maxContextTokens ?? 128000;

  // --- Report ---
  console.log('\n' + '='.repeat(80));
  console.log('CONVERSATION CONTEXT & SUBAGENT ANALYSIS');
  console.log('='.repeat(80));
  console.log(`Conversation ID: ${conversationId}`);
  console.log(`Title: ${convo.title ?? '(none)'}`);
  console.log(`Endpoint: ${convo.endpoint ?? 'unknown'}`);
  console.log(`Agent ID: ${convo.agent_id ?? '(none)'}`);
  console.log(`Model: ${convo.model ?? '(none)'}`);
  console.log(`maxContextTokens: ${maxContextTokens}`);
  console.log('');

  // Message tree visualization
  console.log('--- MESSAGE TREE (conversation structure) ---\n');
  const leaves = findLeafMessageIds(messages);
  let totalContextTokens = 0;
  let maxBranchTokens = 0;
  let maxBranchParent = null;

  for (const leafId of leaves) {
    const ordered = getOrderedMessages(messages, leafId);
    let branchTokens = 0;
    const branchPreview = [];
    for (const m of ordered) {
      const t = estimateMessageTokens(m);
      branchTokens += t;
      const role = m.isCreatedByUser ? 'user' : 'assistant';
      const textPreview =
        typeof m.text === 'string'
          ? m.text.slice(0, 50) + (m.text.length > 50 ? '...' : '')
          : '(content)';
      branchPreview.push(`  [${role}] ${(m.messageId ?? '').slice(0, 8)}... ${t} tok | ${textPreview}`);
    }
    totalContextTokens += branchTokens;
    if (branchTokens > maxBranchTokens) {
      maxBranchTokens = branchTokens;
      maxBranchParent = leafId;
    }
    console.log(`Branch (leaf ${leafId.slice(0, 8)}...): ${branchTokens} tokens`);
    branchPreview.forEach((p) => console.log(p));
    console.log('');
  }

  const avgBranchTokens = leaves.length > 0 ? Math.round(totalContextTokens / leaves.length) : 0;
  console.log('--- CONTEXT SIZE SUMMARY ---\n');
  console.log(`Total messages in conversation: ${messages.length}`);
  console.log(`Number of branches (leaf nodes): ${leaves.length}`);
  console.log(`Max context tokens (convo setting): ${maxContextTokens}`);
  console.log(`Largest branch (to leaf ${(maxBranchParent ?? '').slice(0, 8)}...): ~${maxBranchTokens} tokens`);
  console.log(`Average branch size: ~${avgBranchTokens} tokens`);
  console.log(
    `Fits in context: ${maxBranchTokens <= maxContextTokens ? 'YES' : 'NO (pruning will occur)'}`,
  );
  console.log('');

  // Subagent analysis
  const subAgentCalls = extractRunSubAgentCalls(messages);
  const MAX_SUB_AGENT_PROMPT = 32 * 1024; // chars

  console.log('--- SUBAGENT TOOL CONTENT (run_sub_agent) ---\n');
  console.log(`MAX_SUB_AGENT_PROMPT_LENGTH: ${MAX_SUB_AGENT_PROMPT} chars (~${estimateTokens('x'.repeat(MAX_SUB_AGENT_PROMPT))} tokens)`);
  console.log(`Sub-agent calls found: ${subAgentCalls.length}\n`);

  if (subAgentCalls.length > 0) {
    let totalPromptChars = 0;
    let totalPromptTokens = 0;
    for (const c of subAgentCalls) {
      totalPromptChars += c.promptChars;
      totalPromptTokens += c.promptTokens;
      const seq = c.sequential ? ' [sequential]' : '';
      const trunc = c.truncated ? ' *** TRUNCATED (>32KB) ***' : '';
      console.log(
        `  ${c.messageId?.slice(0, 8)}... [${c.type}] agentId=${c.agentId ?? '?'} | ${c.promptChars} chars, ~${c.promptTokens} tokens${seq}${trunc}`,
      );
    }
    console.log('');
    console.log(`Total prompt content sent to subagents: ${totalPromptChars} chars, ~${totalPromptTokens} tokens`);
    console.log('');
  } else {
    console.log('  (No run_sub_agent tool calls in this conversation)\n');
  }

  // Tool call breakdown
  let toolCallCount = 0;
  const toolNames = new Map();
  for (const msg of messages) {
    if (!Array.isArray(msg.content)) continue;
    for (const part of msg.content) {
      const tc = part?.tool_call ?? part?.toolCall;
      if (!tc?.name) continue;
      toolCallCount++;
      toolNames.set(tc.name, (toolNames.get(tc.name) || 0) + 1);
    }
  }
  console.log('--- TOOL CALLS OVERVIEW ---\n');
  console.log(`Total tool calls: ${toolCallCount}`);
  for (const [name, count] of [...toolNames.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name}: ${count}`);
  }
  console.log('');

  // Architecture summary
  console.log('--- ARCHITECTURE (what gets sent where) ---\n');
  console.log(`
┌─────────────────────────────────────────────────────────────────────────────┐
│ PARENT AGENT (main conversation)                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ • Context: Messages from root → current parentMessageId (pruned to fit       │
│   maxContextTokens via getMessagesWithinTokenLimit)                          │
│ • Tools: Full agent tool set (including run_sub_agent, list_agents, etc.)   │
│ • Sub-agents receive: ONLY the "prompt" string (max 32KB chars)             │
│   - No conversation history, no prior messages                              │
│   - Sequential mode: previous agent output is prepended (truncated if needed)│
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ SUB-AGENT (run_sub_agent)                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ • Context: Single prompt string (user's task description)                   │
│ • Max length: 32,768 characters                                              │
│ • Tools: Non-destructive only (destructive tools stripped)                   │
│ • No run_sub_agent (nested subagents not allowed)                            │
│ • No conversation persistence                                                │
└─────────────────────────────────────────────────────────────────────────────┘
`);

  await mongoose.disconnect();
  console.log('Done.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
