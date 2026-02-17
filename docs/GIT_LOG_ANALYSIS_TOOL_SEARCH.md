# Git Log Analysis: tool_search "No run step or runId found" / Cancelled State

## Summary

Review of the git history points to **several contributing changes**. The main suspect is the **b04968ea4** commit, which restructured completion matching and may have removed fallbacks that tool_search relied on. Additional factors include deferred MCP loading (7c9c7e530), Redis event ordering (feb72ad2d), and content aggregation ordering (7067c3578).

---

## Primary Suspect: b04968ea4 (Feb 16, 2026)

**fix(ToolCall): correct cancelled state and parallel tool content indexing**

### What Changed

1. **Reordered completion logic** – Response lookup happens before index resolution, which can change behavior when `response` is null.
2. **Parallel tools indexing** – Switched from `contentIndex` to `contentIndex + i` for each tool in a step.
3. **Index resolution order** – New order: `indexById` → `resultIndex` → `runStep.index` → else warn and return.
4. **Removed earlier fallback** – Old code:
   - Computed `currentIndex` from `runStep` or `resultIndex`
   - Warned and returned if `!responseMessageId || currentIndex < 0`
   - Then looked up `response` and updated content  
   New code:
   - Looks up `response` first
   - Returns early if `!response`
   - Then resolves `currentIndex` and only warns when `runStep == null` and other fallbacks fail

### Impact on tool_search

- tool_search completion often arrives when `runStep` is null (e.g. step not in map, cleared early, or missing from stream).
- Old logic accepted `resultIndex` even without `runStep`.
- New logic requires at least one of: `indexById`, valid `resultIndex`, or `runStep`. If all fail (e.g. bad/empty `tool_call.id`, wrong `resultIndex`), we hit the warn path.
- The extra fallbacks (name-based, single-pending, tool_search) were added later but can still fail when:
  - Content structure differs (`part.tool_call` vs `part[ContentTypes.TOOL_CALL]`)
  - `pendingCalls` filtering excludes tool_search
  - `toolCallsWithoutOutput.length !== 1` (0 or >1)

**Conclusion:** b04968ea4 made matching stricter and may have broken cases where tool_search relies on `resultIndex` or relaxed fallbacks.

---

## Secondary Factors

### 1. 7c9c7e530 (Jan 8, 2026) – Defer Loading MCP Tools

- Introduced `tool_search` for deferred MCP tools.
- tool_search is used when agents have deferred tools; the model calls it first.
- This is the feature that made tool_search a common path, so any later regression affects it more often.

### 2. feb72ad2d (Feb 5, 2026) – Sequential Event Ordering in Redis Streaming Mode

- Made `emitEvent` async and handlers `await` it.
- Ensures strict ordering in Redis mode.
- Could surface timing issues that were previously masked if events were occasionally reordered or dropped.

### 3. 7067c3578 (Feb 12, 2026) – Content Aggregation Race Condition Fix

- Moved `aggregateContent` to the start of handlers (before `emitEvent`).
- Ensures backend stepMap is updated before sending events.
- Backend aggregation should be more reliable; this is unlikely to be the main cause but may interact with other changes.

### 4. 1ba5bf87b (Feb 5, 2026) – Delta Buffering for Out-of-Order SSE Events

- Added `pendingDeltaBuffer` for deltas arriving before their run step.
- Handles `on_message_delta`, `on_reasoning_delta`; completion handling logic changed separately in b04968ea4.

---

## Likely Root Cause

1. **Stricter matching in b04968ea4** – Index resolution is more rigid; tool_search often lacks a stable `tool_call.id` or correct `resultIndex` when completion arrives late or from a different path.
2. **contentIndex + i for parallel tools** – If tool_search is the only tool in a step, this should behave the same (`i=0`). If it is grouped with others, indexing changes might cause misalignment.
3. **Timing** – With Redis and `await emitEvent`, ordering is stricter. Completions that previously “worked by luck” may now consistently fail when they arrive after `clearStepMaps` or when step IDs do not match.

---

## Recommendations

1. **Bisect around b04968ea4** – Confirm whether reverting or softening this commit fixes the issue.
2. **Check content structure** – Log `content` parts for tool_search to see if `part.tool_call` and `part[ContentTypes.TOOL_CALL]` match and contain the expected `id`.
3. **Relax tool_search fallback** – When `isToolSearch && hasOutput` and there is exactly one tool call without output in content, apply the completion even if `pendingCalls` or other filters fail.
4. **2-second grace period** – Already in place; verify it is active and that completions arrive within that window.
5. **Backend diagnostics** – If “No run step or runId found” appears in backend logs (agents `stream.ts`), inspect whether `ON_RUN_STEP` is emitted before `ON_RUN_STEP_COMPLETED` for tool_search in the agent flow.
