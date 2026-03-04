# Checklist for Adding New Tools

Use this checklist when adding a new native/built-in tool to LibreChat agents.

## 1. Tool Definition & Registry

- [ ] **`packages/data-provider/src/types/assistants.ts`** – Add tool to `Tools` enum
- [ ] **`packages/api/src/tools/registry/definitions.ts`** – Add tool definition (schema, description, `responseFormat` if applicable) and add to `agentToolDefinitions`

## 2. Tool Handler & Wiring

- [ ] **Tool handler** – Create handler (e.g. `api/server/services/<ToolName>/tool.js`) that implements the tool logic
- [ ] **`api/app/clients/tools/util/handleTools.js`** – Import handler and add branch for the tool (pass `req` if needed for file/user context)
- [ ] **`api/server/controllers/agents/callbacks.js`** – If tool returns files/artifacts:
  - Add `is<ToolName>Tool = output.name === Tools.<tool_name>`
  - Process output like `workspace_send_file_to_user` (use `processLocalCodeOutput`, stream attachments)

## 3. ToolService & Capabilities

- [ ] **`api/server/services/ToolService.js`** – Add tool to `nativeTools` array
- [ ] **`api/server/services/ToolService.js`** – Add filter block(s) for the tool (check capability, ephemeral overrides)
- [ ] **`packages/data-provider/src/config.ts`** – Add capability to `AgentCapabilities` enum and `defaultAgentCapabilities` (if capability-gated)

## 4. Agent Models

- [ ] **`api/models/Agent.js`** – Add tool when `ephemeralAgent?.<tool> === true` or `modelSpec?.<toolSpec> === true`
- [ ] **`api/models/loadAddedAgent.js`** – Same as above for load-added agents

## 5. Config & librechat.yaml

- [ ] **`librechat.yaml`** – Add capability to `agents.capabilities` if applicable
- [ ] **`librechat.yaml`** – Add tool to any system agents that should have it

## 6. Client UI

- [ ] **`client/src/utils/toolDisplayNames.ts`** – Add display name for the tool
- [ ] **`client/src/components/Chat/Messages/Content/ToolCall.tsx`** – Add to `TOOL_DISPLAY_NAMES` and `WORKSPACE_TOOL_ICONS` (if workspace tool)
- [ ] **`api/server/utils/toolDisplayNames.js`** – Same
- [ ] **`client/src/components/Chat/Messages/MessageToolsIcons.tsx`** – Icon and label in `BUILT_IN_ICONS` and `labels`
- [ ] **`client/src/components/SidePanel/Agents/AgentPanel.tsx`** – Push tool when `data.<tool> === true` in `onSubmit`
- [ ] **`client/src/components/SidePanel/Agents/AgentSelect.tsx`** – Map tool to capability in `resetAgentForm`, add to `capabilities` object
- [ ] **`client/src/components/SidePanel/Agents/<Tool>Checkbox.tsx`** – Create checkbox component (if capability-gated)
- [ ] **`client/src/components/SidePanel/Agents/AgentConfig.tsx`** – Add checkbox and `useAgentCapabilities` flag
- [ ] **`client/src/hooks/Agents/useAgentCapabilities.ts`** – Add `<tool>Enabled` flag
- [ ] **`client/src/common/agents-types.ts`** – Add to `TAgentCapabilities` if capability-gated
- [ ] **`packages/data-provider/src/schemas.ts`** – Add to `defaultAgentFormValues` if form field
- [ ] **`client/src/locales/en/translation.json`** – Add i18n keys (e.g. `com_agents_enable_<tool>`, `com_assistants_<tool>_info`)

## 7. ToolService Context (optional)

- [ ] **`api/server/services/ToolService.js`** – Add `has<Tool>` and `toolContextMap[Tools.<tool>]` for model context when tool is present

## Note: Workspace Tools Bundled with execute_code

Tools like `workspace_pull_file`, `workspace_read_file`, `workspace_edit_file`, etc. are **not** capability-gated. They are injected automatically when the agent has `execute_code`. For these tools:

- **Skip** steps 4, 5 (Agent models, librechat.yaml capability)
- **Skip** step 6 items: AgentPanel, AgentSelect, Checkbox, AgentConfig, useAgentCapabilities, schemas, i18n
- **Do** add to: `ToolService.js` workspace tools arrays, filter blocks, `toolContextMap`; `handleTools.js` workspace block; `toolDisplayNames`; `MessageToolsIcons`; `ToolCall.tsx`
- **Do** add to `workspaceTools` injection array in `ToolService.js` (when `execute_code` is present)

## Reference: File/Attachment Flow

For tools that return files (e.g. `create_pdf`, `workspace_send_file_to_user`):

- **Backend**: Tool returns `[contentMessage, { session_id, files: [{ name, buffer }] }]` with `responseFormat: 'content_and_artifact'`
- **Callbacks**: `processLocalCodeOutput` saves buffer via `saveBuffer` + `createFile`, streams attachment events
- **Client**: `AttachmentGroup` + `FileAttachment` + `useAttachmentLink` render the file

## Reference: File Storage

- `saveBuffer` from `getStrategyFunctions(fileStrategy)`
- `createFile` in `api/models/File.js`
