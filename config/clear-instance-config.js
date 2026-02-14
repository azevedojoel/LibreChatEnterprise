#!/usr/bin/env node
/**
 * Clears the InstanceConfig (provider visibility override) from the database.
 * Use this when you can't connect to MongoDB directly but need to reset provider visibility.
 *
 * Run: npm run clear-instance-config
 *   or: node config/clear-instance-config.js
 */
const path = require('path');
require('module-alias/register');
require('module-alias').addAlias('~', path.resolve(__dirname, '..', 'api'));

const connect = require('./connect');
const { InstanceConfig } = require('~/db/models');

(async () => {
  await connect();

  try {
    const result = await InstanceConfig.deleteOne({ key: 'default' });

    if (result.deletedCount > 0) {
      console.log('InstanceConfig cleared. Restart your API server to pick up the change.');
    } else {
      console.log('No InstanceConfig found (already using env default).');
    }
  } catch (err) {
    console.error('Failed to clear InstanceConfig:', err.message);
    process.exit(1);
  } finally {
    const mongoose = require('mongoose');
    await mongoose.disconnect();
  }
})();
