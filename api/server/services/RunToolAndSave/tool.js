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
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Convert array of objects to CSV string */
function jsonToCsv(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return '';
  }
  const allKeys = new Set();
  for (const row of data) {
    if (row && typeof row === 'object') {
      Object.keys(row).forEach((k) => allKeys.add(k));
    }
  }
  const headers = Array.from(allKeys);
  const lines = [headers.map(escapeCsvValue).join(',')];
  for (const row of data) {
    if (row && typeof row === 'object') {
      const values = headers.map((h) => escapeCsvValue(row[h]));
      lines.push(values.join(','));
    }
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
      let params = rawInput?.args ?? rawInput ?? {};
      if (typeof params === 'string') {
        try {
          params = JSON.parse(params);
        } catch {
          params = {};
        }
      }
      const { toolName, args = {}, format = 'json', filename } = params;
      if (!toolName || typeof toolName !== 'string') {
        return ['Error: toolName is required.', {}];
      }

      const toolMap =
        rawInput?.toolMap ?? config?.toolCall?.toolMap ?? config?.configurable?.toolMap;
      if (!toolMap || typeof toolMap.get !== 'function') {
        return [
          'Error: run_tool_and_save requires toolMap (injected by ToolNode). Tool may not be available in this context.',
          {},
        ];
      }

      const innerTool = toolMap.get(toolName);
      if (!innerTool) {
        return [`Error: Tool "${toolName}" not found. Use tool_search to find available tools.`, {}];
      }

      try {
        const invokeParams = {
          ...(args ?? {}),
          type: 'tool_call',
          ...(config?.toolCall ?? {}),
        };
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
          const arr = Array.isArray(parsed) ? parsed : parsed?.data ?? [parsed];
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
        'Run any available tool with given arguments and save the output to a file. Use when the user wants to export data (e.g. CRM contacts, Gmail search results) to a file without the raw data passing through the model. Output format can be JSON or CSV. Filename gets a timestamp suffix automatically.',
      schema: {
        type: 'object',
        properties: {
          toolName: {
            type: 'string',
            description:
              'Exact tool name (e.g. "crm_list_contacts" or "gmail_search_mcp_Google-Workspace"). Use tool_search to find available tools.',
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
