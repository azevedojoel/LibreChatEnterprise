# Ellis Default on Login - Review and Next Steps

## What We've Done

### 1. useNewConvo.ts – Default endpoint override
**File:** `client/src/hooks/useNewConvo.ts` (lines 139–146)

When `defaultAgentForChat` is set in config, the default endpoint is forced to `agents`:

```ts
if (
  startupConfig?.defaultAgentForChat &&
  hasAgentAccess &&
  endpointsConfig?.[EModelEndpoint.agents]
) {
  defaultEndpoint = EModelEndpoint.agents;
}
```

**Effect:** New chats use the agents endpoint instead of openAI/custom.

### 2. buildDefaultConvo.ts – Default agent_id
**File:** `client/src/utils/buildDefaultConvo.ts` (lines 81–88)

When the agents endpoint is used and no agent is selected, `agent_id` is set from config:

```ts
if (
  isAgentsEndpoint(endpoint) &&
  !defaultConvo.agent_id &&
  defaultAgentForChat
) {
  defaultConvo.agent_id = defaultAgentForChat;
}
```

**Effect:** New conversations get `agent_id: 'system-general'`.

### 3. useTextarea.ts – Placeholder logic
**File:** `client/src/hooks/Input/useTextarea.ts` (lines 85–91, 104–106)

- Added `useGetStartupConfig` to read `defaultAgentForChat`.
- When `agent_id === defaultAgentForChat` and the agent is not yet in `agentsMap`, we no longer show "Please select an Agent".
- Placeholder falls back to `getEntityName` (shows "Message Agent" when `entityName` is empty).

**Effect:** Avoids "Please select an Agent" when the default agent is configured, but shows "Message Agent" until Ellis is in `agentsMap`.

### 4. Config (librechat.yaml)
- `endpoints.agents.defaultAgentForChat: system-general`
- `endpoints.agents.systemAgents` defines Ellis (id: system-general, name: Ellis)

---

## Current Behavior

1. New chat → agents endpoint, `agent_id: system-general`.
2. If Ellis is in `agentsMap` → "Message Ellis".
3. If Ellis is not in `agentsMap` yet → "Message Agent" (no more "Please select an Agent").

---

## Root Cause: Ellis Not in agentsMap

`agentsMap` comes from `useListAgentsQuery` → `dataService.listAgents()` → `getListAgentsHandler` in `api/server/controllers/agents/v1.js`.

`getListAgentsHandler` uses:
- `findAccessibleResources` → `accessibleIds`
- `getListAgentsByAccess({ accessibleIds, ... })` → returns only agents in `accessibleIds`

`findPubliclyAccessibleResources` is called but only used to set `isPublic` on agents. Publicly accessible IDs are not merged into `accessibleIds`.

System agents (e.g. Ellis) are seeded with PUBLIC VIEW. If `findAccessibleResources` does not include agents with PUBLIC VIEW for a given user, Ellis will not appear in the list.

---

## Next Steps

### Option A: Include system agents in the agents list (recommended)

Ensure `getListAgentsHandler` returns system agents (e.g. Ellis) for all users with agent access.

**Implementation:** In `api/server/controllers/agents/v1.js`, merge `publiclyAccessibleIds` into the IDs passed to `getListAgentsByAccess`:

```js
const allAccessibleIds = [...new Set([
  ...accessibleIds.map((id) => id.toString()),
  ...publiclyAccessibleIds.map((id) => id.toString()),
])];

const data = await getListAgentsByAccess({
  accessibleIds: allAccessibleIds,
  otherParams: filter,
  limit,
  after: cursor,
});
```

(Exact types and conversion may need adjustment for the API.)

**Effect:** Ellis appears in `agentsMap` → placeholder shows "Message Ellis".

### Option B: Add defaultAgentName to config

Add `defaultAgentName: Ellis` under `endpoints.agents` in librechat.yaml, expose it in the config API, and use it in `useTextarea` when `defaultAgentForChat` matches and the agent is not in `agentsMap`.

**Effect:** Shows "Message Ellis" even before the agents list loads, without hardcoding.

### Option C: Preload default agent

When `defaultAgentForChat` is set, fetch that agent (e.g. via `getAgentById`) before or alongside the agents list and inject it into `agentsMap`.

**Effect:** Ellis is available in `agentsMap` earlier.

---

## Recommendation

**Option A** is the most robust: system agents with PUBLIC VIEW should be included in the agents list for all users. That aligns with `seedSystemAgents` (“Grants PUBLIC VIEW so all users see them in the agent selection UI”) and fixes the placeholder without extra config or client preloading.

---

## Files Changed (Summary)

| File | Change |
|------|--------|
| `client/src/hooks/useNewConvo.ts` | Prefer agents endpoint when `defaultAgentForChat` is set |
| `client/src/hooks/Input/useTextarea.ts` | Skip "Please select an Agent" when `agent_id === defaultAgentForChat`; use `useGetStartupConfig` |
| `client/src/utils/buildDefaultConvo.ts` | (Already present) Set `agent_id` from `defaultAgentForChat` when empty |

## Option A - Implemented

**File:** `api/server/controllers/agents/v1.js`

- Added `mongoose` require
- Merge `publiclyAccessibleIds` into `accessibleIds` as `allAccessibleIds` before calling `getListAgentsByAccess`
- Both the avatar refresh and main list now use `allAccessibleIds`

System agents (e.g. Ellis) with PUBLIC VIEW now appear in the agents list for all users.
