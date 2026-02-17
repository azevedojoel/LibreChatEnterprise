# Staged Changes Analysis & Commit Organization

**Date:** Feb 17, 2026  
**Branch:** `feat/scheduled-agents-cancel-and-workspace-scope`  
**Staged files:** 64 files, ~2,755 additions, ~427 deletions

---

## Show-stoppers

### 1. `api/server/controllers/agents/callbacks.js` – result.index order

**Issue:** The staged version sets `data.result.index` **after** `aggregateContent()`. The comment in the working copy says it must be set **BEFORE** aggregateContent for frontend content index resolution.

**Current (working tree, correct):**
```js
// Ensure result.index is set BEFORE aggregateContent (needed for fallback resolution)
if (data?.result != null && typeof data.result.index !== 'number') {
  data.result.index = 0;
}
aggregateContent({ event, data });
```

**Staged (incorrect):**
```js
aggregateContent({ event, data });
// Ensure result.index is set for frontend content index resolution
if (data?.result != null && typeof data.result.index !== 'number') {
  data.result.index = 0;
}
```

**Action:** Either:
1. Stage the current working copy (correct order), or
2. Amend the staged version to move the index check before `aggregateContent`.

---

## Logical commit groups

Use `git reset` to unstage, then commit in this order:

---

### Commit 1: Add packages/agents submodule

**Purpose:** Track the agents fork as a submodule.

```
.gitmodules
packages/agents (submodule)
```

**Suggested message:** `chore: add packages/agents submodule`

---

### Commit 2: tool_search consolidation & classification

**Purpose:** Single `tool_search` instead of per-MCP variants; `isToolSearchTool` helper.

- `packages/api/src/tools/classification.ts` – add `isToolSearchTool`
- `packages/api/src/tools/classification.spec.ts` – tests
- `packages/api/src/tools/toolkits/index.ts` – (check if staged)
- `packages/data-provider/src/config.ts` – `Constants.TOOL_SEARCH`, `TOOL_SEARCH_MCP_PREFIX`
- `api/app/clients/prompts/truncate.js` – never truncate `tool_search` output
- `api/server/services/ToolService.js` – `isToolSearchTool`, `delete_file`, tool_search name/description
- `packages/api/src/agents/handlers.ts` – alias `tool_search_mcp_*` → `tool_search`
- `packages/api/src/agents/run.ts` – `isToolSearchTool` in `extractDiscoveredToolsFromHistory`
- `packages/api/src/agents/run.spec.ts` – tests for `tool_search_mcp_*` and `getToolsSentToModel`

**Suggested message:** `refactor(tool_search): consolidate to single tool_search, add isToolSearchTool`

---

### Commit 3: getToolsSentToModel and response metadata

**Purpose:** Track tools actually sent to the model and expose in response metadata.

- `packages/api/src/agents/run.ts` – `getToolsSentToModel`
- `api/server/controllers/agents/client.js` – `getToolsForResponse`, `_toolsSentByAgentId`, `metadata.tools`
- `api/server/controllers/agents/v1.js` – include `tools` in basic agent response

**Suggested message:** `feat(agents): add getToolsSentToModel and metadata.tools in completion response`

---

### Commit 4: Local code execution – venv, requirements, artifact filtering

**Purpose:** Python venv with standard libs; better tool context; exclude inputs from artifacts.

- `api/server/services/LocalCodeExecution/requirements.txt` (new)
- `api/server/services/LocalCodeExecution/executor.js` – venv setup, `ensureCodeExecVenv`
- `api/server/services/LocalCodeExecution/tool.js` – `EXCLUDED_OUTPUT_FILENAMES`, `buildCodeExecutionDescription`, filtered artifacts
- `api/server/services/LocalCodeExecution/__tests__/executor.spec.js` – tests for blocklist
- `api/server/services/Files/Code/process.js` – improved `toolContext` for pandas
- `packages/api/src/files/context.ts` – execute_code fallback when no text context
- `api/server/controllers/agents/client.js` – execute_code fallback for `fileIdentifier` attachments

**Suggested message:** `feat(execute_code): add venv with standard libs, improve context and artifact filtering`

---

### Commit 5: Agent file unlinking (orphan handling)

**Purpose:** Unlink agent resource files when they no longer exist in DB.

- `api/server/routes/files/files.js` – use `removeAgentResourceFiles` when `dbFiles.length === 0`

**Suggested message:** `fix(files): unlink agent resources for orphan files via removeAgentResourceFiles`

---

### Commit 6: Scheduled agents – full tool access

**Purpose:** Ensure scheduled agents always use all agent tools.

- `api/server/services/ScheduledAgents/executeAgent.js` – stop passing `ephemeralAgent.tools`

**Suggested message:** `fix(scheduled-agents): always include all agent tools, do not restrict by ephemeralAgent`

---

### Commit 7: Tool-call diagnostics & result.index fix

**Purpose:** Logging for missing tool output; ensure `result.index` for frontend.

- `api/server/controllers/agents/callbacks.js` – **fix order**: set `result.index` before `aggregateContent`, add diagnostic
- `api/server/controllers/agents/request.js` – log incomplete tool parts in final response

**Suggested message:** `fix(agents): set result.index before aggregateContent, add tool-call diagnostics`

---

### Commit 8: BadgeRow, ToolsDropdown, MCPSubMenu (chat input tools UI)

**Purpose:** Tool badges and dropdown for agents endpoint.

- `client/src/Providers/BadgeRowContext.tsx` (new)
- `client/src/Providers/CodeBlockContext.tsx` – `ShowCodeToggleContext`
- `client/src/Providers/index.ts` – `BadgeRowProvider`
- `client/src/components/Chat/Input/BadgeRow.tsx` (new)
- `client/src/components/Chat/Input/ChatForm.tsx` – integrate BadgeRow
- `client/src/components/Chat/Input/MCPSubMenu.tsx` (new)
- `client/src/components/Chat/Input/ToolDialogs.tsx` (new)
- `client/src/components/Chat/Input/ToolsDropdown.tsx` (new)
- `client/src/hooks/useChatBadges.ts` (new)
- `client/src/store/badgeAtoms.ts` (new)
- `client/src/store/misc.ts` – `chatBadges`
- `client/src/store/index.ts` – export `badgeAtoms`
- `client/public/assets/microsoft.svg` (new)
- `client/src/components/SidePanel/Agents/Code/ApiKeyDialog.tsx` (new)

**Suggested message:** `feat(chat): add BadgeRow, ToolsDropdown, MCPSubMenu for agent tool selection`

---

### Commit 9: Message tools icons and tool call UI

**Purpose:** Display tool icons and tool call state in messages.

- `client/src/components/Chat/Messages/MessageToolsIcons.tsx` (new)
- `client/src/components/Chat/Messages/Content/ToolCall.tsx`
- `client/src/components/Chat/Messages/Content/ContentParts.tsx`
- `client/src/components/Chat/Messages/Content/Parts/ExecuteCode.tsx`
- `client/src/components/Chat/Messages/Content/MarkdownLite.tsx`
- `client/src/components/Chat/Messages/MessageParts.tsx`
- `client/src/components/Chat/Messages/ui/MessageRender.tsx`
- `client/src/components/Chat/Messages/Content/CodeAnalyze.tsx`
- `client/src/components/Messages/Content/CodeBlock.tsx`
- `client/src/components/Messages/ContentRender.tsx`

**Suggested message:** `feat(ui): add MessageToolsIcons, improve tool call and code block rendering`

---

### Commit 10: SSE step handler and event handlers

**Purpose:** Handling steps and tool calls in SSE stream.

- `client/src/hooks/SSE/useStepHandler.ts`
- `client/src/hooks/SSE/useEventHandlers.ts`
- `client/src/hooks/SSE/useResumableSSE.ts`
- `client/src/hooks/SSE/__tests__/useStepHandler.spec.ts`
- `client/src/hooks/index.ts`

**Suggested message:** `feat(sse): improve step handler and event handling for tool calls`

---

### Commit 11: MCP client updates

**Purpose:** MCP connection status, server manager, and UI tweaks.

- `client/src/hooks/MCP/useMCPConnectionStatus.ts`
- `client/src/hooks/MCP/useMCPServerManager.ts`
- `client/src/components/MCP/ServerInitializationSection.tsx`
- `client/src/components/MCP/StackedMCPIcons.tsx`
- `client/src/components/SidePanel/MCPBuilder/MCPCardActions.tsx`
- `client/src/components/SidePanel/MCPBuilder/MCPServerCard.tsx`
- `client/src/hooks/Plugins/useToolToggle.ts` – (5 lines removed)

**Suggested message:** `refactor(mcp): update connection status, server manager, and builder UI`

---

### Commit 12: MCP config and MS365 scopes

**Purpose:** MCP allowlist, OAuth scopes, icons.

- `librechat.yaml` – MCP allowlist, icons, MS365 scopes
- `scripts/ms365-app-registration.json` – new scopes

**Suggested message:** `chore(mcp): add Monday/Asana allowlist, MS365 Teams scopes, icon paths`

---

### Commit 13: Docs – add analysis, remove obsolete

**Purpose:** Update documentation.

- `docs/GIT_LOG_ANALYSIS_TOOL_SEARCH.md` (new) – tool_search diagnostic notes
- `docs/UPSTREAM_SYNC_PLAN.md` (new) – sync plan
- `docs/TOOL_DESCRIPTIONS_COMPARISON.md` (deleted)
- `docs/WEBHOOK_SECURITY.md` (deleted)

**Suggested message:** `docs: add tool_search analysis and sync plan, remove obsolete docs`

---

## Notes

1. **callbacks.js** – Fix the `result.index` vs `aggregateContent` order before committing.
2. **Unstaged files** – `Dockerfile`, `api/config/index.js`, `api/package.json`, `package-lock.json`, `package.json`, locales, `ToolCallGroup.tsx`, `HoverButtons.tsx`, `MCP.js`, `MCPManager.ts`, etc. are not staged; consider separate commits or inclusion where appropriate.
3. **Untracked** – `docs/AGENTS_STREAM_PATCH.md`, `toolSearch.spec.ts`, `toolSearch.ts`, `scripts/inspect-tool-calls.js` are untracked; add and commit if they belong in this branch.
