# Conversation Context & Subagent Analysis

This document explains how conversation context flows through LibreChat agents and subagents, including context size limits and what gets sent where.

## Quick Reference: Conversation `d2645a64-29bf-4536-b517-49f43888aaba`

Run the analysis script:

```bash
node scripts/analyze-conversation-context.js d2645a64-29bf-4536-b517-49f43888aaba
```

### Summary (from analysis)

| Metric | Value |
|--------|-------|
| **Conversation** | Multi-Agent Story Creation Orchestration |
| **Total messages** | 20 |
| **Branches (leaf nodes)** | 6 |
| **Max context tokens** | 128,000 |
| **Largest branch** | ~2,236 tokens |
| **Fits in context** | ✅ YES |
| **run_sub_agent calls** | 4 (all to system-coder) |
| **Subagent prompt size** | ~249 chars / ~63 tokens each |
| **Total subagent content** | 996 chars, ~252 tokens |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           USER REQUEST (new message)                               │
└──────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  PARENT AGENT (main conversation)                                                  │
│  ───────────────────────────────────────────────────────────────────────────────  │
│  • Loads messages: getMessages({ conversationId })                                 │
│  • Orders by thread: getMessagesForConversation({ messages, parentMessageId })    │
│  • Prunes to fit: getMessagesWithinTokenLimit({ maxContextTokens, ... })          │
│  • Sends to LLM: system + ordered messages + tools                                │
│                                                                                   │
│  Context sent to model:                                                            │
│  ┌─────────────────────────────────────────────────────────────────────────────┐ │
│  │ System prompt (if any)                                                       │ │
│  │ Message 1 (root)                                                             │ │
│  │ Message 2                                                                     │ │
│  │ ...                                                                          │ │
│  │ Message N (current parent)                                                    │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
│  Total: up to maxContextTokens (e.g. 128,000)                                     │
└──────────────────────────────────────────────────────────────────────────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
                    ▼                     ▼                     ▼
            ┌───────────────┐     ┌───────────────┐     ┌───────────────┐
            │ Tool: search  │     │ Tool:         │     │ Tool:         │
            │               │     │ run_sub_agent │     │ lc_transfer   │
            └───────────────┘     └───────┬───────┘     └───────────────┘
                    │                     │
                    │                     ▼
                    │     ┌──────────────────────────────────────────────────────┐
                    │     │  SUB-AGENT (isolated run)                             │
                    │     │  ─────────────────────────────────────────────────   │
                    │     │  Receives: ONLY the "prompt" string (max 32,768 chars) │
                    │     │  • No conversation history                            │
                    │     │  • No prior messages                                  │
                    │     │  • Sequential mode: previous agent output prepended   │
                    │     │  • Tools: non-destructive only (run_sub_agent stripped)│
                    │     └──────────────────────────────────────────────────────┘
                    │
                    └─────────────────────────────────────────────────────────────
```

---

## Context Size Limits

| Component | Limit | Location |
|-----------|-------|----------|
| **Parent agent context** | `maxContextTokens` (convo setting, e.g. 128K) | `packages/agents/src/messages/prune.ts` |
| **Sub-agent prompt** | 32,768 characters | `api/server/services/SubAgent/executeSubAgent.js` |
| **Sub-agent sequential context** | Truncated to fit within 32KB minus fixed overhead | `api/server/services/SubAgent/subAgentTool.js` |

### Token Estimation

- Rough heuristic: **~4 characters per token** for English
- Actual counting uses tiktoken (cl100k_base) in `packages/api/src/utils/tokenizer.ts`
- Tool outputs can be truncated via `truncateToolCallOutputs` to avoid context overflow

---

## Subagent Tool Content

When the parent agent calls `run_sub_agent`:

1. **Single run**: `{ agentId, prompt }` → sub-agent receives `prompt` only
2. **Parallel runs**: `{ tasks: [{ agentId, prompt }, ...] }` → each sub-agent receives its `prompt`
3. **Sequential runs**: `{ tasks: [...], sequential: true }` → each sub-agent receives:
   - Task 1: `prompt` only
   - Task 2+: `--- Context from previous agent ---\n${previousOutput}\n\n--- Your task ---\n${prompt}`
   - Previous output is truncated if it would exceed 32KB

### What Subagents Do NOT Receive

- Conversation history
- Parent agent's full context
- Other tool outputs from the parent
- `run_sub_agent` (nested subagents are not allowed)

---

## Tool Definitions Size

Tool definitions (names, descriptions, schemas) are sent with every request. They contribute to context:

- **Parent agent**: Full tool set (MCP tools, built-in tools, run_sub_agent, list_agents, etc.)
- **Sub-agent**: Same agent's tools minus destructive tools and run_sub_agent

Tool definition size varies by agent configuration. Use the analysis script to inspect message content; tool schema JSON is part of the payload sent to the LLM.

---

## Files

| File | Purpose |
|------|---------|
| `scripts/analyze-conversation-context.js` | Analyze a conversation's structure, context size, and subagent calls |
| `api/server/services/SubAgent/executeSubAgent.js` | Sub-agent execution, 32KB prompt limit |
| `api/server/services/SubAgent/subAgentTool.js` | run_sub_agent tool, sequential/parallel logic |
| `packages/agents/src/messages/prune.ts` | Context pruning (getMessagesWithinTokenLimit) |
