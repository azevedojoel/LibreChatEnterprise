# Upstream Sync Plan: LibreChat → LibreChatEnterprise

**Generated:** Feb 16, 2026

## Current State

| Metric | Value |
|--------|-------|
| **Your branch** | `feat/scheduled-agents-cancel-and-workspace-scope` (60 commits ahead of common ancestor) |
| **Upstream** | `danny-avila/LibreChat` main |
| **Upstream commits to incorporate** | 21 |
| **Common ancestor** | `e142ab72da` |
| **Overlapping files (conflict risk)** | 21 files |

---

## Answer: Can You Pull Commits Without Using All of Them?

**Yes.** Here are the options:

### Option A: Merge Upstream (Recommended)

```bash
git checkout feat/scheduled-agents-cancel-and-workspace-scope
git merge upstream/main
# Resolve conflicts, then:
git add . && git commit -m "Merge upstream/main - resolve conflicts"
```

- All 21 upstream commits become part of your history
- GitHub will no longer show "X commits behind upstream" for these
- During conflict resolution, you can **keep your version** for files you've customized
- You're not obligated to use every change—merging means "incorporated," not "adopted"

### Option B: Rebase Onto Upstream

```bash
git checkout feat/scheduled-agents-cancel-and-workspace-scope
git rebase upstream/main
```

- Replays your 60 commits on top of upstream
- Cleaner linear history
- **Risky**: More conflict resolution (possibly 60 times)
- Use only if your branch is relatively short or you're comfortable with complex rebases

### Option C: Cherry-Pick Only Wanted Commits

- You'd still show as "behind" for unpicked commits
- **Not recommended** if your goal is to clear the "pending upstream" status

---

## Upstream Commits to Review (oldest → newest)

| # | SHA | Date | Type | Summary | Conflict Risk |
|---|-----|------|------|---------|---------------|
| 1 | `3888dfa48` | 2026-02-13 | feat | Expose enableServiceLinks in Helm Deployment Templates | Low (Helm only) |
| 2 | `2e42378b1` | 2026-02-13 | 🔒 fix | **Secure Cookie Localhost Bypass and OpenID Token Selection in AuthService** | None |
| 3 | `8e3b717e9` | 2026-02-13 | fix | Memory Agent Fails to Initialize with Ollama Provider | Low |
| 4 | `dc89e0003` | 2026-02-13 | refactor | **Distinguish ID Tokens from Access Tokens in OIDC Federated Auth** | None |
| 5 | `276ac8d01` | 2026-02-13 | feat | Add Bedrock Parameter Settings for MoonshotAI and Z.AI Models | Medium (schemas, tokens) |
| 6 | `ccbf9dc09` | 2026-02-13 | fix | **Convert `const` to `enum` in MCP Schemas for Gemini Compatibility** | High (**MCP.js**, definitions.ts) |
| 7 | `e50f59062` | 2026-02-13 | feat | Smart Reinstall with Turborepo Caching for Better DX | Low (.gitignore, turbo.json) |
| 8 | `dc489e7b2` | 2026-02-13 | fix | **Tab Isolation for Agent Favorites + MCP Selections** | High (**MCPSelect, mcp.ts**) |
| 9 | `6cc6ee320` | 2026-02-13 | refactor | Optimize Model Selector | Low |
| 10 | `467df0f07` | 2026-02-13 | feat | Override Custom Endpoint Schema with Specified Params Endpoint | High (initialize.ts, parsers) |
| 11 | `f72378d38` | 2026-02-13 | chore | **Extract Agent Client Utilities to `/packages/api`** | High (**agents/client.js**) |
| 12 | `65d138267` | 2026-02-14 | chore | `@librechat/agents` to v3.1.42 | Low (package.json) |
| 13 | `bf1f2f431` | 2026-02-14 | refactor | Better Whitespace handling in Chat Message rendering | Low |
| 14 | `10685fca9` | 2026-02-14 | refactor | **Artifacts via Model Specs & Scope Badge Persistence** | High (**BadgeRow, MCPSelect, useMCPSelect**) |
| 15 | `b0a32b7d6` | 2026-02-14 | fix | Prevent Async Title Generation From Recreating Deleted Conversations | None |
| 16 | `a89945c24` | 2026-02-14 | fix | Accessible Contrast for Theme Switcher Icons | Low |
| 17 | `2513e0a42` | 2026-02-14 | feat | `deleteRagFile` utility for Consistent RAG API document deletion | Medium (Files) |
| 18 | `bf9aae057` | 2026-02-14 | feat | Add Redis as Optional Sub-chart Dependency in Helm Chart | Low |
| 19 | `12f45c76e` | 2026-02-14 | feat | Bedrock Parameters for OpenAI GPT-OSS models | Low (tokens, schemas) |
| 20 | `2ea72a0f8` | 2026-02-15 | fix | Google JSON Schema Normalization/Resolution Logic | Medium (MCP zod) |
| 21 | `b06e741cb` | 2026-02-15 | chore | `@librechat/agents` to v3.1.43 | Low (package.json) |

---

## High-Risk Overlapping Files

These files were modified in **both** your branch and upstream. Expect merge conflicts:

| File | Upstream Commits | Your Changes |
|------|------------------|--------------|
| `api/server/controllers/agents/client.js` | Extract to packages/api (f72378d38) | Scheduled agents, workspace scope |
| `api/server/services/MCP.js` | MCP enum fix (ccbf9dc09) | Enterprise MCP features |
| `packages/api/src/agents/initialize.ts` | Params endpoint (467df0f07) | Your agent init |
| `packages/api/src/tools/definitions.ts` | MCP enum fix (ccbf9dc09) | Tool definitions |
| `client/src/Providers/BadgeRowContext.tsx` | Scope badge persistence (10685fca9) | Your badge/scope logic |
| `client/src/components/Chat/Input/MCPSelect.tsx` | Tab isolation, badge (dc489e7b2, 10685fca9) | MCP selection |
| `client/src/components/Chat/Input/MCPSubMenu.tsx` | Same as above | MCP menu |
| `client/src/components/SidePanel/Agents/AgentPanel.tsx` | AuthService (2e42378b1) | Agent panel |
| `packages/data-provider/src/config.ts` | Params, schemas (467df0f07, 10685fca9) | Config |
| `packages/data-provider/src/schemas.ts` | Bedrock, tokens (276ac8d01, 12f45c76e) | Schemas |
| `packages/data-provider/src/types.ts` | Types (10685fca9) | Types |

---

## Step-by-Step Review & Incorporate Plan

### Phase 1: Prepare (Before Merging)

1. **Create a backup branch**
   ```bash
   git branch backup/feat-scheduled-agents-$(date +%Y%m%d)
   ```

2. **Ensure clean working tree**
   ```bash
   git status
   git stash  # if needed
   ```

3. **Update main with upstream** (optional but cleaner)
   ```bash
   git checkout main
   git merge upstream/main  # or: git pull upstream main
   git push origin main
   ```

### Phase 2: Merge Strategy

**Recommended: Merge upstream/main into your feature branch**

```bash
git checkout feat/scheduled-agents-cancel-and-workspace-scope
git merge upstream/main
```

### Phase 3: Conflict Resolution Order

When conflicts occur, use this checklist:

1. **`api/server/controllers/agents/client.js`**
   - Upstream moved logic to `packages/api/src/agents/client.ts`
   - **Action**: Accept upstream's extraction, then re-apply your scheduled agent / workspace logic into the new structure
   - Review: `packages/api/src/agents/client.ts` (new file from upstream)

2. **`api/server/services/MCP.js`**
   - Upstream: `const` → `enum` for Gemini compatibility
   - **Action**: Merge both—take upstream's enum changes, keep your Enterprise MCP additions

3. **`packages/api/src/tools/definitions.ts`**
   - Same MCP enum fix
   - **Action**: Merge—upstream's enum + your tool definitions

4. **MCP/Badge UI files** (BadgeRowContext, MCPSelect, MCPSubMenu, etc.)
   - Upstream: Tab isolation, scope badge persistence
   - **Action**: Manually merge—upstream's accessibility/UX fixes + your workspace scope behavior

5. **`packages/data-provider`** (config, schemas, types)
   - Upstream: Params endpoint, model specs, Bedrock
   - **Action**: Merge—add upstream's new config/schemas, preserve your custom types

### Phase 4: Commit by Commit Review (Optional Deep Dive)

If you want to understand or selectively validate each change before merging:

```bash
# Review each commit's diff
git log -p e142ab72da..upstream/main --reverse

# Or one at a time:
git show 3888dfa48    # First commit
git show 2e42378b1    # Second commit
# etc.
```

### Phase 5: Verify After Merge

```bash
npm install
npm run build
npm test   # or your test command
```

### Phase 6: Push

```bash
git push origin feat/scheduled-agents-cancel-and-workspace-scope
```

---

## Priority: Which Upstream Commits Are "Must-Have"?

| Priority | Commits | Reason |
|----------|---------|--------|
| **Critical** | 2e42378b1, dc89e0003 | Security (auth, OIDC tokens) |
| **High** | ccbf9dc09, f72378d38 | MCP compatibility, agent client extraction |
| **High** | dc489e7b2, 10685fca9 | MCP tab isolation, badge persistence |
| **Medium** | b0a32b7d6, 8e3b717e9 | Bug fixes (title gen, Ollama) |
| **Medium** | 2513e0a42 | RAG file deletion utility |
| **Low** | Package bumps, Helm, DX | Nice to have |

---

## Quick Reference: Merge Commands

```bash
# One-shot merge (after backup)
git checkout feat/scheduled-agents-cancel-and-workspace-scope
git fetch upstream
git merge upstream/main

# If conflicts: resolve, then
git add .
git commit -m "Merge upstream/main - incorporate 21 commits"

# Verify & push
npm run build && npm test
git push origin feat/scheduled-agents-cancel-and-workspace-scope
```

---

## Summary

- **Merge** `upstream/main` into your branch to incorporate all 21 commits and clear "pending upstream" status.
- You can resolve conflicts by keeping your version where your customizations matter.
- Focus conflict resolution on the 11 overlapping files; the rest should merge cleanly.
- Create a backup branch before merging.
- Security-related commits (2e42378b1, dc89e0003) should be prioritized in conflict resolution.
