#!/usr/bin/env node
/**
 * Wipes MongoDB, Redis, and PostgreSQL (pgvector) databases.
 * Env: MONGO_URI, REDIS_URI (or REDIS_URL), POSTGRES_URI (or DATABASE_URL).
 * Run: MONGO_URI=... REDIS_URI=... POSTGRES_URI=... node scripts/wipe-databases.js
 */
const mongoose = require('mongoose');

async function wipeMongo(uri) {
  if (!uri) {
    console.log('Skipping MongoDB: MONGO_URI not set');
    return;
  }
  try {
    await mongoose.connect(uri);
    const client = mongoose.connection.getClient();
    const { databases } = await client.db().admin().listDatabases();
    for (const db of databases) {
      if (!['admin', 'config', 'local'].includes(db.name)) {
        await client.db(db.name).dropDatabase();
        console.log(`Dropped MongoDB database: ${db.name}`);
      }
    }
  } finally {
    await mongoose.disconnect();
  }
}

async function wipePostgres(uri) {
  const url = uri || process.env.DATABASE_URL;
  if (!url) {
    console.log('Skipping PostgreSQL: POSTGRES_URI/DATABASE_URL not set');
    return;
  }
  try {
    const { Client } = require('pg');
    const client = new Client({
      connectionString: url,
      connectionTimeoutMillis: 10000,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    console.log('PostgreSQL schema dropped and recreated');
    await client.end();
  } catch (err) {
    console.error('PostgreSQL wipe failed:', err.message);
  }
}

async function wipeRedis(uri) {
  const url = uri || process.env.REDIS_URL;
  if (!url) {
    console.log('Skipping Redis: REDIS_URI/REDIS_URL not set');
    return;
  }
  try {
    const Redis = require('ioredis');
    const redis = new Redis(url, { maxRetriesPerRequest: 1 });
    await redis.flushall();
    console.log('Redis FLUSHALL OK');
    redis.disconnect();
  } catch (err) {
    console.error('Redis wipe failed:', err.message);
  }
}

async function main() {
  const mongoUri = process.env.MONGO_URI;
  const redisUri = process.env.REDIS_URI || process.env.REDIS_URL;
  const postgresUri = process.env.POSTGRES_URI || process.env.DATABASE_URL;
  console.log('Wiping databases...');
  await wipeMongo(mongoUri);
  await wipeRedis(redisUri);
  await wipePostgres(postgresUri);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
