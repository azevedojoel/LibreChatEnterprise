/**
 * Feature Flag Service - manages runtime feature flags stored in DB.
 * Flags override values in startup config; changes require cache invalidation.
 */
const mongoose = require('mongoose');
const { CacheKeys } = require('librechat-data-provider');
const { FeatureFlag } = require('~/db/models');
const getLogStores = require('~/cache/getLogStores');
const { getAppConfig } = require('~/server/services/Config');
const { getBalanceConfig, isEnabled } = require('@librechat/api');

/** Allowed keys and their types. Value must match type. */
const FLAG_REGISTRY = {
  summarizeEnabled: { type: 'boolean', path: ['featureFlags', 'summarizeEnabled'] },
  toolsMenuEnabled: { type: 'boolean', path: ['featureFlags', 'toolsMenuEnabled'] },
  forkEnabled: { type: 'boolean', path: ['featureFlags', 'forkEnabled'] },
  regenerateEnabled: { type: 'boolean', path: ['featureFlags', 'regenerateEnabled'] },
  feedbackEnabled: { type: 'boolean', path: ['featureFlags', 'feedbackEnabled'] },
  copyEnabled: { type: 'boolean', path: ['featureFlags', 'copyEnabled'] },
  editEnabled: { type: 'boolean', path: ['featureFlags', 'editEnabled'] },
  continueEnabled: { type: 'boolean', path: ['featureFlags', 'continueEnabled'] },
  balanceEnabled: { type: 'boolean', path: ['balance', 'enabled'] },
  toolCallDetailsEnabled: { type: 'boolean', path: ['interface', 'toolCallDetails'] },
  showBirthdayIcon: { type: 'boolean', path: ['showBirthdayIcon'] },
  sharePointFilePickerEnabled: { type: 'boolean', path: ['sharePointFilePickerEnabled'] },
  customFooter: { type: 'string', path: ['customFooter'] },
};

/**
 * Get value from object by path array.
 * @param {Object} obj - Source object
 * @param {string[]} path - Path segments (e.g. ['balance', 'enabled'])
 * @returns {unknown}
 */
function getValueByPath(obj, path) {
  if (!obj || !Array.isArray(path) || path.length === 0) return undefined;
  let current = obj;
  for (const key of path) {
    if (current == null) return undefined;
    current = current[key];
  }
  return current;
}

/**
 * Build minimal base config for resolving flag values when not in DB.
 * Mirrors logic from config route for config-driven flags.
 * @returns {Promise<Object>}
 */
async function getBaseConfigForFlags() {
  const appConfig = await getAppConfig();
  const balanceConfig = getBalanceConfig(appConfig);
  const isBirthday = () => {
    const today = new Date();
    return today.getMonth() === 1 && today.getDate() === 11;
  };
  return {
    balance: balanceConfig ?? {},
    interface: appConfig?.interfaceConfig ?? {},
    showBirthdayIcon:
      isBirthday() ||
      isEnabled(process.env.SHOW_BIRTHDAY_ICON) ||
      process.env.SHOW_BIRTHDAY_ICON === '',
    sharePointFilePickerEnabled: isEnabled(process.env.ENABLE_SHAREPOINT_FILEPICKER),
    customFooter:
      typeof process.env.CUSTOM_FOOTER === 'string' ? process.env.CUSTOM_FOOTER : '',
  };
}

/**
 * Get all feature flags with effective values (DB override or config).
 * Returns every key in FLAG_REGISTRY with value and source.
 * @returns {Promise<Array<{ key: string, value: unknown, source: 'override'|'config', description: string|null }>>}
 */
async function getEffectiveFeatureFlags() {
  const [dbDocs, baseConfig] = await Promise.all([
    FeatureFlag.find({}).sort({ key: 1 }).lean(),
    getBaseConfigForFlags(),
  ]);
  const dbMap = new Map(dbDocs.map((d) => [d.key, d]));

  return Object.keys(FLAG_REGISTRY).map((key) => {
    const entry = FLAG_REGISTRY[key];
    const db = dbMap.get(key);
    if (db) {
      return {
        key,
        value: db.value,
        source: 'override',
        description: db.description ?? null,
      };
    }
    const configValue = getValueByPath(baseConfig, entry.path);
    const value =
      configValue !== undefined && configValue !== null
        ? configValue
        : entry.type === 'boolean'
          ? true
          : '';
    return {
      key,
      value,
      source: 'config',
      description: null,
    };
  });
}

/**
 * Get all feature flags as { key: value }.
 * @returns {Promise<Record<string, { key: string, value: unknown, description?: string }[]>>}
 */
async function getAllFeatureFlags() {
  const docs = await FeatureFlag.find({}).sort({ key: 1 }).lean();
  return docs.map((d) => ({
    key: d.key,
    value: d.value,
    description: d.description ?? null,
  }));
}

/**
 * Validate and set a feature flag. Upserts by key.
 * @param {string} key - Flag key (must be in FLAG_REGISTRY)
 * @param {boolean|string|number} value - Value to set
 * @param {string} userId - Admin user ID (createdBy)
 * @returns {Promise<{ key: string, value: unknown }>}
 */
async function setFeatureFlag(key, value, userId) {
  const entry = FLAG_REGISTRY[key];
  if (!entry) {
    throw new Error(`Unknown feature flag: ${key}. Allowed: ${Object.keys(FLAG_REGISTRY).join(', ')}`);
  }

  const { type } = entry;
  let coerced = value;
  if (type === 'boolean') {
    if (typeof value === 'boolean') coerced = value;
    else if (value === 'true' || value === 1) coerced = true;
    else if (value === 'false' || value === 0) coerced = false;
    else throw new Error(`Flag ${key} expects boolean, got ${typeof value}`);
  } else if (type === 'string') {
    if (typeof value !== 'string') throw new Error(`Flag ${key} expects string, got ${typeof value}`);
  } else if (type === 'number') {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new Error(`Flag ${key} expects number, got ${typeof value}`);
    }
  }

  const userObjId = mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(userId)
    : null;
  if (!userObjId) {
    throw new Error('Invalid userId for createdBy');
  }

  const doc = await FeatureFlag.findOneAndUpdate(
    { key },
    { $set: { value: coerced, createdBy: userObjId, updatedAt: new Date() } },
    { upsert: true, new: true },
  ).lean();

  await clearStartupConfigCache();
  return { key: doc.key, value: doc.value };
}

/**
 * Get merged startup config with FeatureFlag overrides applied.
 * @param {Object} baseConfig - Base startup config payload
 * @returns {Promise<Object>} Merged config
 */
async function getMergedStartupConfig(baseConfig) {
  const flags = await FeatureFlag.find({}).lean();
  if (flags.length === 0) {
    return baseConfig;
  }

  const result = { ...baseConfig };

  for (const flag of flags) {
    const entry = FLAG_REGISTRY[flag.key];
    if (!entry) continue;

    const path = entry.path;
    if (path.length === 1) {
      result[path[0]] = flag.value;
    } else {
      if (!result[path[0]]) {
        result[path[0]] = {};
      }
      result[path[0]][path[1]] = flag.value;
    }
  }

  return result;
}

/**
 * Clear the startup config cache so next request gets fresh config.
 * @returns {Promise<boolean>}
 */
async function clearStartupConfigCache() {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  return await cache.delete(CacheKeys.STARTUP_CONFIG);
}

/**
 * Get the list of allowed flag keys for validation/help.
 * @returns {string[]}
 */
function getAllowedKeys() {
  return Object.keys(FLAG_REGISTRY);
}

module.exports = {
  getAllFeatureFlags,
  getEffectiveFeatureFlags,
  setFeatureFlag,
  getMergedStartupConfig,
  clearStartupConfigCache,
  getAllowedKeys,
  FLAG_REGISTRY,
};
