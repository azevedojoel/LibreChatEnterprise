# Deploy Migrations Runbook

Run these migrations **before** deploying when upgrading to a version that includes the corresponding schema/code changes.

## Migration Order

1. **migrate:scheduled-agents-to-prompts** (if you have scheduled agents)
2. **migrate:workspace-tool-names** (if you have agents with workspace tools)

---

## 1. Scheduled Agents → Scheduled Prompts

**When:** Upgrading from a version with `ScheduledAgent` (prompt string) to `ScheduledPrompt` (promptGroupId).

**What it does:** Migrates documents from `scheduledagents` to `scheduledprompts`, creating a PromptGroup + Prompt for each schedule's prompt text.

```bash
# Dry run first (recommended)
npm run migrate:scheduled-agents-to-prompts:dry-run

# Apply migration
npm run migrate:scheduled-agents-to-prompts
```

**Required:** MongoDB connection (same as app). Ensure `MONGO_URI` or equivalent is set.

---

## 2. Workspace Tool Names

**When:** Upgrading to a version that renames workspace tools (e.g. `read_file` → `workspace_read_file`, `search_files` → `search_user_files`).

**What it does:** Updates `tools` and `tool_options` in Agents, Presets, and Conversations that reference old tool names.

```bash
# Dry run first (recommended)
npm run migrate:workspace-tool-names:dry-run

# Apply migration
npm run migrate:workspace-tool-names
```

**Required:** MongoDB connection. Run **before** or **immediately after** deploy. Otherwise, agents with old tool names will fail to load tools.
