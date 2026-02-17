#!/usr/bin/env node
/**
 * Initialize pgvector schema for RAG API (langchain_community PGVector).
 * Run: railway link (select pgvector) && railway run node scripts/init-pgvector-rag.js
 * Or: DATABASE_URL="postgres://..." node scripts/init-pgvector-rag.js
 */
const fs = require('fs');
const path = require('path');

const url =
  process.env.DATABASE_URL ||
  process.env.DATABASE_PUBLIC_URL ||
  process.env.DATABASE_URL_PRIVATE;

if (!url || url.includes('@:/')) {
  console.error(
    'DATABASE_URL not set or incomplete. Enable TCP Proxy on pgvector (Railway → pgvector → Settings → Networking → Add TCP Proxy, port 5432), then run:\n  railway link && railway run node scripts/init-pgvector-rag.js'
  );
  process.exit(1);
}

async function run() {
  const { Client } = require('pg');
  const sqlPath = path.join(__dirname, 'init-pgvector-rag.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = new Client({
    connectionString: url,
    ssl: url.includes('railway') ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    await client.query(sql);
    console.log('pgvector RAG schema initialized successfully.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
