const { ContentTypes } = require('librechat-data-provider');

const MAX_TOOL_OUTPUT_LEN = 200;
const MAX_ARGS_LEN = 100;

/**
 * Format aggregated agent response for email reply.
 * Includes main text and tool call summaries (highlights).
 * @param {Object} params
 * @param {string} params.text - Main text content
 * @param {string} [params.reasoning] - Reasoning/thinking content (optional)
 * @param {Map<number, Object>} params.toolCalls - Tool calls from aggregator
 * @returns {string} Plain text suitable for email body
 */
function formatEmailHighlights({ text, reasoning, toolCalls }) {
  const sections = [];

  if (reasoning && reasoning.trim()) {
    sections.push(`---\n${reasoning.trim()}\n---`);
  }

  if (text && text.trim()) {
    sections.push(text.trim());
  }

  if (toolCalls && toolCalls.size > 0) {
    const toolLines = [];
    for (const [, tc] of toolCalls) {
      const name = tc?.function?.name ?? 'unknown';
      const argsStr =
        typeof tc?.function?.arguments === 'string'
          ? tc.function.arguments
          : JSON.stringify(tc?.function?.arguments ?? {});
      const output = tc?.output ?? tc?.content ?? '';
      const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
      const truncated =
        outputStr.length > MAX_TOOL_OUTPUT_LEN
          ? outputStr.slice(0, MAX_TOOL_OUTPUT_LEN) + '...'
          : outputStr;

      toolLines.push(`[Tool: ${name}]\n  Args: ${argsStr.slice(0, MAX_ARGS_LEN)}${argsStr.length > MAX_ARGS_LEN ? '...' : ''}`);
      if (truncated) {
        toolLines.push(`  Output: ${truncated}`);
      }
    }
    sections.push('\nTools used:\n' + toolLines.join('\n'));
  }

  return sections.join('\n\n');
}

/**
 * Format content parts (from message.content array) for email.
 * Used when we have raw content parts instead of aggregator output.
 * @param {Array} contentParts - Message content parts
 * @returns {string} Plain text
 */
function formatContentPartsForEmail(contentParts) {
  if (!Array.isArray(contentParts)) {
    return '';
  }

  const parts = [];
  for (const part of contentParts) {
    if (!part) {
      continue;
    }
    if (part.type === ContentTypes.TEXT && part.text) {
      parts.push(typeof part.text === 'string' ? part.text : part.text?.value ?? '');
    } else if (part.type === ContentTypes.TOOL_CALL && part.tool_call) {
      const tc = part.tool_call;
      const name = tc.name ?? tc.function?.name ?? 'unknown';
      const output = tc.output ?? '';
      const outStr = typeof output === 'string' ? output : JSON.stringify(output);
      const truncated = outStr.length > MAX_TOOL_OUTPUT_LEN ? outStr.slice(0, MAX_TOOL_OUTPUT_LEN) + '...' : outStr;
      parts.push(`[Tool: ${name}]\n${truncated}`);
    }
  }
  return parts.join('\n\n');
}

module.exports = {
  formatEmailHighlights,
  formatContentPartsForEmail,
};
