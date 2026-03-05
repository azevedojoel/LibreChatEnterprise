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

/** Build filename with timestamp and correct extension */
function buildFilename(base, format, toolName) {
  const ext = format === 'csv' ? '.csv' : '.json';
  const safeBase = (base || toolName || 'output').replace(/[^a-zA-Z0-9_-]/g, '_');
  const suffix = `${getTimestampSuffix()}_${getShortHash(Date.now())}`;
  return `${safeBase}_${suffix}${ext}`;
}

/** Escape CSV value (handles commas, newlines, quotes) */
function escapeCsvValue(val) {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Flatten nested object for CSV: { a: 1, b: { c: 2 } } -> { a: 1, "b.c": 2 }. Arrays become joined strings. */
function flattenForCsv(obj, prefix = '') {
  if (obj == null) return {};
  if (Array.isArray(obj)) {
    return { [prefix || 'value']: obj.map((v) => (v != null && typeof v === 'object' ? JSON.stringify(v) : v)).join('; ') };
  }
  if (typeof obj !== 'object') return { [prefix || 'value']: obj };
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flattenForCsv(v, key));
    } else if (Array.isArray(v)) {
      const primitives = v.every((x) => x == null || typeof x !== 'object');
      out[key] = primitives ? v.join('; ') : v.map((x) => (x != null && typeof x === 'object' ? JSON.stringify(x) : x)).join('; ');
    } else {
      out[key] = v;
    }
  }
  return out;
}

/** Common keys where API responses nest arrays (e.g. { taskLists: [...] }, { items: [...] }) */
const ARRAY_KEYS = ['data', 'items', 'taskLists', 'tasks', 'files', 'messages', 'results', 'records', 'entries', 'list'];

/** Extract array from parsed response - handles nested shapes from MCP/API tools */
function extractArrayForCsv(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [parsed];
  for (const key of ARRAY_KEYS) {
    const arr = parsed[key];
    if (Array.isArray(arr) && arr.length > 0) return arr;
  }
  return [parsed];
}

/** Convert array of objects to CSV string (flattens nested objects so cells are primitives, not JSON) */
function jsonToCsv(data) {
  if (!Array.isArray(data) || data.length === 0) return '';
  const flattened = data.map((row) => (row && typeof row === 'object' ? flattenForCsv(row) : { value: row }));
  const allKeys = new Set();
  for (const row of flattened) {
    Object.keys(row).forEach((k) => allKeys.add(k));
  }
  const headers = Array.from(allKeys);
  const lines = [headers.map(escapeCsvValue).join(',')];
  for (const row of flattened) {
    const values = headers.map((h) => escapeCsvValue(row[h]));
    lines.push(values.join(','));
  }
  return lines.join('\n');
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
        params.toolName != null || params.tool_name != null || params.format != null
          ? params
          : params.args ?? {};
      // Accept toolName, tool_name, or name (some LLMs use snake_case)
      let toolName = p.toolName ?? p.tool_name ?? p.name ?? rawInput?.toolName ?? rawInput?.tool_name;
      const args = p.args ?? {};
      const format = p.format ?? 'json';
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
        const effectiveFormat = format === 'csv' ? 'csv' : 'json';

        if (effectiveFormat === 'csv') {
          let parsed;
          try {
            parsed = typeof content === 'string' ? JSON.parse(content) : content;
          } catch {
            parsed = [{ output: content }];
          }
          const arr = extractArrayForCsv(parsed);
          fileContent = jsonToCsv(arr);
        } else {
          try {
            const parsed = typeof content === 'string' ? JSON.parse(content) : content;
            fileContent = JSON.stringify(parsed, null, 2);
          } catch {
            fileContent =
              typeof content === 'string' ? content : JSON.stringify({ output: content });
          }
        }

        const buffer = Buffer.from(fileContent, 'utf8');
        if (buffer.length > MAX_OUTPUT_SIZE_BYTES) {
          return [
            `Error: Output size (${(buffer.length / 1024).toFixed(1)} KB) exceeds limit of ${MAX_OUTPUT_SIZE_BYTES / 1024} KB`,
            {},
          ];
        }

        const name = buildFilename(filename, effectiveFormat, toolName);

        const artifact = {
          session_id: sessionId,
          files: [{ name, buffer }],
        };

        return [
          `Saved ${effectiveFormat.toUpperCase()} output to ${name}.`,
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
        'Run any available tool with given arguments and save the output to a file. Use when the user wants to export data (e.g. CRM contacts, Gmail search results, Google Tasks) to a file without the raw data passing through the model. Output format can be JSON or CSV. Filename gets a timestamp suffix automatically.',
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
          format: {
            type: 'string',
            enum: ['json', 'csv'],
            description: 'Output format: "json" (default) or "csv". CSV works best for array-of-objects data.',
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
