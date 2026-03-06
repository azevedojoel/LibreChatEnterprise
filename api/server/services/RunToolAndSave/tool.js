const { v4 } = require('uuid');
const crypto = require('crypto');
const { tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');

/** Max output size (5MB) to prevent abuse */
const MAX_OUTPUT_SIZE_BYTES = 5 * 1024 * 1024;

/** Timestamp suffix: YYYYMMDD_HHmmss */
function getTimestampSuffix() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${y}${m}${d}_${h}${min}${s}`;
}

/** Short hash for uniqueness (first 8 chars of sha256) */
function getShortHash(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex').slice(0, 8);
}

/** Build filename with timestamp and .json extension */
function buildFilename(base, toolName) {
  const safeBase = (base || toolName || 'output').replace(/[^a-zA-Z0-9_-]/g, '_');
  const suffix = `${getTimestampSuffix()}_${getShortHash(Date.now())}`;
  return `${safeBase}_${suffix}.json`;
}

/** Extract string content from tool output (handles ToolMessage, content_and_artifact tuple, content blocks) */
function extractContent(output) {
  if (typeof output === 'string') return output;

  if (Array.isArray(output) && output.length >= 1) {
    const first = output[0];
    if (typeof first === 'string') return first;
    if (first?.type === 'text' && typeof first.text === 'string') return first.text;
  }

  if (output && typeof output === 'object' && 'content' in output) {
    const c = output.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c) && c.length >= 1) {
      const first = c[0];
      if (typeof first === 'string') return first;
      if (first?.type === 'text' && typeof first.text === 'string') return first.text;
    }
  }

  return String(output ?? '');
}

function createRunToolAndSaveTool() {
  const sessionId = v4();

  return tool(
    async (rawInput, config) => {
      let params = rawInput ?? {};
      if (typeof params === 'string') {
        try {
          params = JSON.parse(params);
        } catch {
          params = {};
        }
      }
      // Params may be at top level (LangChain validated input) or in params.args (ToolNode invokeParams)
      const p =
        params.toolName != null || params.tool_name != null
          ? params
          : params.args ?? {};
      // Accept toolName, tool_name, or name (some LLMs use snake_case)
      let toolName = p.toolName ?? p.tool_name ?? p.name ?? rawInput?.toolName ?? rawInput?.tool_name;
      const args = p.args ?? {};
      const filename = p.filename;

      if (!toolName || typeof toolName !== 'string') {
        logger.debug('[run_tool_and_save] Missing toolName:', {
          rawInputKeys: Object.keys(rawInput ?? {}),
          paramsKeys: Object.keys(p ?? {}),
        });
        const received = JSON.stringify({ paramsKeys: Object.keys(p ?? {}) });
        return [`Error: toolName is required. Received: ${received}`, {}];
      }

      const toolMap =
        rawInput?.toolMap ?? config?.toolCall?.toolMap ?? config?.configurable?.toolMap;
      if (!toolMap || typeof toolMap.get !== 'function') {
        return [
          'Error: run_tool_and_save requires toolMap (injected by ToolNode). Tool may not be available in this context.',
          {},
        ];
      }

      let innerTool = toolMap.get(toolName);
      if (!innerTool && typeof toolMap.entries === 'function') {
        // MCP tools use suffixed names (e.g. tasks_listTasks_mcp_Google).
        // If LLM sends base name "tasks_listTasks", try prefix match.
        const candidates = [];
        for (const [key] of toolMap.entries()) {
          if (key === toolName || key.startsWith(`${toolName}_mcp_`)) candidates.push(key);
        }
        if (candidates.length === 1) {
          innerTool = toolMap.get(candidates[0]);
        }
      }
      if (!innerTool) {
        return [`Error: Tool "${toolName}" not found. Use tool_search to find available tools.`, {}];
      }

      try {
        const cleanArgs = args ?? {};
        const invokeParams = Object.fromEntries(
          Object.entries(cleanArgs).filter(([, v]) => v !== undefined)
        );
        const output = await innerTool.invoke(invokeParams, config);
        const content = extractContent(output);

        let fileContent;
        try {
          const parsed = typeof content === 'string' ? JSON.parse(content) : content;
          fileContent = JSON.stringify(parsed, null, 2);
        } catch {
          fileContent =
            typeof content === 'string' ? content : JSON.stringify({ output: content });
        }

        const buffer = Buffer.from(fileContent, 'utf8');
        if (buffer.length > MAX_OUTPUT_SIZE_BYTES) {
          return [
            `Error: Output size (${(buffer.length / 1024).toFixed(1)} KB) exceeds limit of ${MAX_OUTPUT_SIZE_BYTES / 1024} KB`,
            {},
          ];
        }

        const name = buildFilename(filename, toolName);

        const artifact = {
          session_id: sessionId,
          files: [{ name, buffer }],
        };

        return [
          `Saved JSON output to ${name}.`,
          artifact,
        ];
      } catch (error) {
        logger.error('[run_tool_and_save] Error:', error);
        return [
          `Error running tool: ${error?.message || 'Unknown error'}`,
          {},
        ];
      }
    },
    {
      name: 'run_tool_and_save',
      description:
        'Run any available tool with given arguments and save the output to a JSON file. Use when the user wants to export data (e.g. CRM contacts, Gmail search results, Google Tasks) to a file without the raw data passing through the model. Filename gets a timestamp suffix automatically.',
      schema: {
        type: 'object',
        properties: {
          toolName: {
            type: 'string',
            description:
              'Exact tool name (e.g. "crm_list_contacts", "gmail_search_mcp_Google", "tasks_listTasks_mcp_Google"). Use tool_search to find available tools.',
          },
          args: {
            type: 'object',
            description: 'Arguments to pass to the tool. Schema depends on the tool.',
          },
          filename: {
            type: 'string',
            description:
              'Optional base filename (e.g. "contacts"). Extension and timestamp are added automatically.',
          },
        },
        required: ['toolName'],
      },
      responseFormat: 'content_and_artifact',
    },
  );
}

module.exports = { createRunToolAndSaveTool };
