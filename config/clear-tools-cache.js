#!/usr/bin/env node

/**
 * Clears the tools cache (available tools, MCP tools).
 * Use when tool definitions appear stale (e.g. wrong execute_code schema).
 * Also clears the tools/plugins list cache so the agent tool selector refreshes.
 *
 * Usage:
 *   npm run clear-tools-cache
 *   node config/clear-tools-cache.js
 *   node config/clear-tools-cache.js --mcp-server=Google
 */

const path = require('path');
const { CacheKeys } = require('librechat-data-provider');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });

const {
  invalidateCachedTools,
  invalidateMCPServerByName,
} = require('~/server/services/Config/getCachedTools');
const getLogStores = require('~/cache/getLogStores');

function parseArgs() {
  const args = process.argv.slice(2);
  const mcpServer = args.find((a) => a.startsWith('--mcp-server='));
  return { mcpServer: mcpServer ? mcpServer.split('=')[1] : null };
}

async function main() {
  const { mcpServer } = parseArgs();

  await invalidateCachedTools({ invalidateGlobal: true });

  const cache = getLogStores(CacheKeys.TOOL_CACHE);
  await cache.delete(CacheKeys.TOOLS);
  await cache.delete(CacheKeys.PLUGINS);

  if (mcpServer) {
    const deleted = await invalidateMCPServerByName(mcpServer);
    console.log(`✅ Cleared ${deleted} MCP cache entries for server "${mcpServer}".`);
  }

  console.log('✅ Tools cache cleared. Restart the backend to pick up changes.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Failed to clear tools cache:', err.message);
  process.exit(1);
});
