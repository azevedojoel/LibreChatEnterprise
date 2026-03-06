/**
 * Migration: Drop old tooloverrides unique index (toolId_1_agentId_1) and ensure
 * new index (toolId_1_agentId_1_userId_1) exists for approval gating support.
 * Run before deploy: node scripts/migrate-tool-override-index.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const coll = db.collection('tooloverrides');

  try {
    const indexes = await coll.indexes();
    const oldIndexName = 'toolId_1_agentId_1';
    const hasOld = indexes.some((i) => i.name === oldIndexName);
    if (hasOld) {
      await coll.dropIndex(oldIndexName);
      console.log('Dropped old index:', oldIndexName);
    } else {
      console.log('Old index not found, skipping drop');
    }
  } catch (e) {
    if (e.codeName === 'IndexNotFound') {
      console.log('Old index already dropped');
    } else {
      throw e;
    }
  }

  const newIndexName = 'toolId_1_agentId_1_userId_1';
  const hasNew = (await coll.indexes()).some((i) => i.name === newIndexName);
  if (!hasNew) {
    await coll.createIndex(
      { toolId: 1, agentId: 1, userId: 1 },
      { unique: true, name: newIndexName },
    );
    console.log('Created new index:', newIndexName);
  } else {
    console.log('New index already exists, skipping create');
  }

  await mongoose.connection.close();
  console.log('Migration complete');
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
