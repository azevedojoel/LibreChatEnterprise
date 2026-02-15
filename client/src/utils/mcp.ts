import { Constants } from 'librechat-data-provider';

/**
 * Extracts the MCP server name from a tool ID.
 * Tool IDs use the format: {toolName}_mcp_{serverName}
 * Tool names can contain _mcp_ (e.g. send_stripe_mcp_feedback), so the server
 * name is always the last segment after splitting by the delimiter.
 */
export function extractMCPServerFromToolId(toolId: string): string | undefined {
  if (!toolId?.includes(Constants.mcp_delimiter)) {
    return undefined;
  }
  const parts = toolId.split(Constants.mcp_delimiter);
  return parts.pop() || undefined;
}
