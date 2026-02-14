#!/usr/bin/env node
/**
 * Sync environment variables from a local file to Railway.
 * Keeps your env config with your code - no need to paste 800 vars in the Railway UI.
 *
 * Usage:
 *   cp .env .env.railway   # Copy your env, edit if needed (use Railway's Mongo/Meili URLs)
 *   RAILWAY_TOKEN=xxx node scripts/sync-railway-env.js [path/to/.env.railway]
 *
 * Or with Railway CLI linked:
 *   railway link   # One-time: link to your project
 *   node scripts/sync-railway-env.js
 *
 * Get token: https://railway.com/account/tokens
 * Get IDs: Railway dashboard -> project -> service -> Cmd+K to copy IDs
 */

const fs = require('fs');
const path = require('path');

const RAILWAY_GRAPHQL = 'https://backboard.railway.com/graphql/v2';
const envFile = process.argv[2] || path.resolve(process.cwd(), '.env.railway');

function parseEnvFile(content) {
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).replace(/\\(.)/g, '$1');
    }
    vars[key] = value;
  }
  return vars;
}

async function variableCollectionUpsert(token, projectId, environmentId, serviceId, variables, replace = false) {
  const input = { projectId, environmentId, variables };
  if (serviceId) input.serviceId = serviceId;

  const body = {
    query: `
      mutation VariableCollectionUpsert($input: VariableCollectionUpsertInput!) {
        variableCollectionUpsert(input: $input)
      }
    `,
    variables: { input: { ...input, replace } },
  };

  const res = await fetch(RAILWAY_GRAPHQL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Railway API ${res.status}: ${text}`);
  }
  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

async function main() {
  if (!fs.existsSync(envFile)) {
    console.error(`\nFile not found: ${envFile}`);
    console.error('\nCreate it from your .env:');
    console.error('  cp .env .env.railway');
    console.error('\nThen update MONGO_URI, DOMAIN_*, etc. for Railway (MongoDB Atlas URL, your domain).');
    console.error('\nRun: node scripts/sync-railway-env.js [path/to/.env.railway]\n');
    process.exit(1);
  }

  const token = process.env.RAILWAY_TOKEN;
  const projectId = process.env.RAILWAY_PROJECT_ID;
  const environmentId = process.env.RAILWAY_ENVIRONMENT_ID;
  const serviceId = process.env.RAILWAY_SERVICE_ID;

  if (!token) {
    console.error('\nRAILWAY_TOKEN required. Get one at https://railway.com/account/tokens\n');
    process.exit(1);
  }
  if (!projectId || !environmentId) {
    console.error('\nRAILWAY_PROJECT_ID and RAILWAY_ENVIRONMENT_ID required.');
    console.error('Get them: Railway dashboard -> your project -> Cmd+K -> copy IDs');
    console.error('Or add to .env.railway and source before running.\n');
    process.exit(1);
  }

  const content = fs.readFileSync(envFile, 'utf8');
  const variables = parseEnvFile(content);

  if (Object.keys(variables).length === 0) {
    console.error('\nNo variables found in file. Expected KEY=value format.\n');
    process.exit(1);
  }

  // Don't sync RAILWAY_* vars (they're for the script, not the app)
  const cleaned = {};
  for (const [k, v] of Object.entries(variables)) {
    if (k.startsWith('RAILWAY_')) continue;
    cleaned[k] = v;
  }

  console.log(`Syncing ${Object.keys(cleaned).length} variables to Railway...`);
  await variableCollectionUpsert(token, projectId, environmentId, serviceId || null, cleaned, false);
  console.log('Done. Railway will redeploy with the new variables.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
