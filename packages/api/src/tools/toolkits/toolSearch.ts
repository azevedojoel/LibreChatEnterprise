import { Constants } from 'librechat-data-provider';

/**
 * Builds the tool_search tool context with workflow instructions for deferred tools.
 * Injected into toolContextMap so the agent understands when and how to use tool_search.
 */
export function buildToolSearchContext(): string {
  return `# \`${Constants.TOOL_SEARCH}\`:
Deferred tools are not loaded until discovered. Call tool_search first with a query matching the capability you need (e.g., "commits", "files", "search"). The result lists available tool names—then call those tools directly. Use mcp_server to filter by server when you know which MCP server has the tool.`.trim();
}
