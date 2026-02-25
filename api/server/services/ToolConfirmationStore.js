/**
 * ToolConfirmationStore - Redis-backed store for pending tool confirmations.
 * Survives Railway restarts, works across multiple instances via pub/sub.
 * Falls back to in-memory when Redis is disabled (loses state on restart).
 */
const { logger } = require('@librechat/data-schemas');
const { ioredisClient, cacheConfig } = require('@librechat/api');

const TTL_SECONDS = 3600; // 1 hour
const KEY_PREFIX = 'tool_confirmation';

/** Hash tag for Redis Cluster - all keys for same conversation in same slot */
function key(conversationId, runId, toolCallId) {
  return `${KEY_PREFIX}:{${conversationId}}:${runId}:${toolCallId}`;
}

/** In-memory fallback when Redis is disabled */
const memoryMap = new Map();

/**
 * Register a pending tool confirmation. Returns a promise that resolves when user approves/denies.
 * @param {Object} params
 * @param {string} params.conversationId
 * @param {string} params.runId
 * @param {string} params.toolCallId
 * @param {string} params.userId
 * @param {string} params.toolName
 * @param {string} [params.argsSummary]
 * @returns {Promise<{ promise: Promise<{ approved: boolean }> }>}
 */
async function register({ conversationId, runId, toolCallId, userId, toolName, argsSummary = '' }) {
  const compositeKey = key(conversationId, runId, toolCallId);
  const payload = {
    userId,
    toolName,
    argsSummary,
    status: 'pending',
    createdAt: Date.now(),
  };

  let resolvePromise;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });

  if (!cacheConfig.USE_REDIS || !ioredisClient) {
    logger.warn('[ToolConfirmationStore] Redis disabled, using in-memory (state lost on restart)');
    memoryMap.set(compositeKey, { payload, resolve: resolvePromise });
    return { promise };
  }

  try {
    await ioredisClient.set(compositeKey, JSON.stringify(payload), 'EX', TTL_SECONDS);

    const subscriber = ioredisClient.duplicate();
    subscriber.on('message', (channel, message) => {
      if (channel !== compositeKey) return;
      const entry = memoryMap.get(compositeKey);
      if (entry?.timeout) clearTimeout(entry.timeout);
      memoryMap.delete(compositeKey);
      try {
        const data = JSON.parse(message);
        resolvePromise({ approved: data.approved === true });
      } catch (err) {
        logger.error('[ToolConfirmationStore] Failed to parse pub/sub message:', err);
        resolvePromise({ approved: false });
      }
      try {
        subscriber.unsubscribe(compositeKey);
        subscriber.disconnect();
      } catch {
        /* ignore */
      }
    });

    await subscriber.subscribe(compositeKey);

    // Timeout: if no response within TTL, treat as denied
    const timeout = setTimeout(
      () => {
        const entry = memoryMap.get(compositeKey);
        if (entry) {
          memoryMap.delete(compositeKey);
          try {
            entry.subscriber?.unsubscribe(compositeKey);
            entry.subscriber?.disconnect();
          } catch {
            /* ignore */
          }
          resolvePromise({ approved: false });
        }
      },
      (TTL_SECONDS - 10) * 1000,
    ); // Slightly before Redis TTL

    memoryMap.set(compositeKey, { resolve: resolvePromise, timeout, subscriber });
  } catch (err) {
    logger.error('[ToolConfirmationStore] Redis register failed:', err);
    resolvePromise({ approved: false });
  }

  return { promise };
}

/**
 * Submit user's approval/denial. Call from POST /tool-confirmation or approval page.
 * @param {Object} params
 * @param {string} params.conversationId
 * @param {string} params.runId
 * @param {string} params.toolCallId
 * @param {boolean} params.approved
 * @param {string} params.userId
 * @returns {Promise<{ success: boolean, error?: 'expired' | 'unauthorized' }>}
 */
async function submit({ conversationId, runId, toolCallId, approved, userId }) {
  const compositeKey = key(conversationId, runId, toolCallId);

  if (!cacheConfig.USE_REDIS || !ioredisClient) {
    const entry = memoryMap.get(compositeKey);
    if (!entry) {
      return { success: false, error: 'expired' };
    }
    if (entry.payload && String(entry.payload.userId) !== String(userId)) {
      return { success: false, error: 'unauthorized' };
    }
    memoryMap.delete(compositeKey);
    if (entry.resolve) {
      entry.resolve({ approved });
    }
    return { success: true };
  }

  try {
    const raw = await ioredisClient.get(compositeKey);
    if (!raw) {
      return { success: false, error: 'expired' };
    }

    const payload = JSON.parse(raw);
    if (payload.status !== 'pending') {
      return { success: false, error: 'expired' };
    }
    if (String(payload.userId) !== String(userId)) {
      return { success: false, error: 'unauthorized' };
    }

    payload.status = approved ? 'approved' : 'denied';
    await ioredisClient.set(compositeKey, JSON.stringify(payload), 'EX', 60); // Short TTL after resolve

    await ioredisClient.publish(compositeKey, JSON.stringify({ approved }));

    return { success: true };
  } catch (err) {
    logger.error('[ToolConfirmationStore] Submit failed:', err);
    return { success: false, error: 'expired' };
  }
}

/**
 * Get pending confirmation details (for approval page display).
 * @param {string} conversationId
 * @param {string} runId
 * @param {string} toolCallId
 * @returns {Promise<{ userId, toolName, argsSummary } | null>}
 */
async function getPending(conversationId, runId, toolCallId) {
  const compositeKey = key(conversationId, runId, toolCallId);

  if (!cacheConfig.USE_REDIS || !ioredisClient) {
    const entry = memoryMap.get(compositeKey);
    return entry?.payload
      ? {
          userId: entry.payload.userId,
          toolName: entry.payload.toolName,
          argsSummary: entry.payload.argsSummary,
        }
      : null;
  }

  try {
    const raw = await ioredisClient.get(compositeKey);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (payload.status !== 'pending') return null;
    return {
      userId: payload.userId,
      toolName: payload.toolName,
      argsSummary: payload.argsSummary || '',
    };
  } catch {
    return null;
  }
}

module.exports = {
  register,
  submit,
  getPending,
};
