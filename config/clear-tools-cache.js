#!/usr/bin/env node

/**
 * Clears the tools cache (available tools, MCP tools).
 * Use when tool definitions appear stale (e.g. wrong execute_code schema).
 *
 * Usage:
 *   npm run clear-tools-cache
 *   node config/clear-tools-cache.js
 */

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });

const { invalidateCachedTools } = require('~/server/services/Config/getCachedTools');

async function main() {
  await invalidateCachedTools({ invalidateGlobal: true });
  console.log('✅ Tools cache cleared. Restart the backend to pick up changes.');
}

main().catch((err) => {
  console.error('❌ Failed to clear tools cache:', err.message);
  process.exit(1);
});
