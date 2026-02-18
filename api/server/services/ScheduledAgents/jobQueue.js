/**
 * BullMQ job queue for scheduled agent runs.
 * Queues run_schedule requests so they execute async; caller gets runId immediately.
 *
 * Uses a dedicated Redis connection without keyPrefix - BullMQ requires unprefixed
 * ioredis and provides its own prefix option.
 */
const IoRedis = require('ioredis');
const { Queue, Worker, Job, DelayedError } = require('bullmq');
const { logger } = require('@librechat/data-schemas');
const { cacheConfig, isEnabled } = require('@librechat/api');
const { executeScheduledAgent } = require('./executeAgent');

const QUEUE_NAME = 'scheduled-agent-runs';
const DEFAULT_CONCURRENCY = 3;
const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 20;
const JOB_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const RETRY_ATTEMPTS = 3;
const AGENT_LOCK_DELAY_MS = 5000;

function getConcurrency() {
  const raw = parseInt(process.env.SCHEDULED_AGENTS_QUEUE_CONCURRENCY, 10);
  if (Number.isNaN(raw)) return DEFAULT_CONCURRENCY;
  return Math.max(MIN_CONCURRENCY, Math.min(MAX_CONCURRENCY, raw));
}

let bullConnection = null;
let queue = null;
let worker = null;

/**
 * Create a Redis connection for BullMQ. BullMQ does not support ioredis with keyPrefix;
 * it uses its own prefix option. So we create a dedicated connection without keyPrefix.
 * @returns {import('ioredis').Redis|import('ioredis').Cluster|null}
 */
function getRedisConnection() {
  if (!cacheConfig?.USE_REDIS || !cacheConfig.REDIS_URI) {
    return null;
  }
  if (bullConnection) {
    return bullConnection;
  }

  const urls = cacheConfig.REDIS_URI.split(',').map((uri) => new URL(uri));
  const username = urls[0]?.username || cacheConfig.REDIS_USERNAME;
  const password = urls[0]?.password || cacheConfig.REDIS_PASSWORD;
  const redisOptions = {
    username: username || undefined,
    password: password || undefined,
    tls: cacheConfig.REDIS_CA ? { ca: cacheConfig.REDIS_CA } : undefined,
    maxRetriesPerRequest: null, // Required by BullMQ for Worker (blocking commands)
    enableOfflineQueue: cacheConfig.REDIS_ENABLE_OFFLINE_QUEUE,
    connectTimeout: cacheConfig.REDIS_CONNECT_TIMEOUT,
    // Do NOT set keyPrefix - BullMQ uses its own prefix option
  };

  const useCluster = urls.length > 1 || cacheConfig.USE_REDIS_CLUSTER;
  if (useCluster) {
    bullConnection = new IoRedis.Cluster(
      urls.map((url) => ({ host: url.hostname, port: parseInt(url.port, 10) || 6379 })),
      {
        redisOptions,
        ...(cacheConfig.REDIS_USE_ALTERNATIVE_DNS_LOOKUP
          ? {
              dnsLookup: (address, callback) => callback(null, address),
            }
          : {}),
      },
    );
  } else {
    bullConnection = new IoRedis(cacheConfig.REDIS_URI, redisOptions);
  }

  return bullConnection;
}

/**
 * BullMQ prefix for queue keys. Namespace with app key prefix when set.
 */
function getBullPrefix() {
  if (cacheConfig.REDIS_KEY_PREFIX && cacheConfig.REDIS_KEY_PREFIX.length > 0) {
    return `${cacheConfig.REDIS_KEY_PREFIX}${cacheConfig.GLOBAL_PREFIX_SEPARATOR}scheduled-agents`;
  }
  return 'bull';
}

/**
 * Redis key for per-agent lock. Ensures only one scheduled run per agent at a time.
 */
function getAgentLockKey(agentId) {
  const prefix = getBullPrefix();
  return `${prefix}:agent-lock:${agentId}`;
}

/**
 * Try to acquire a per-agent lock. Returns true if acquired, false if another run holds it.
 */
async function tryAcquireAgentLock(agentId, runId) {
  const conn = getRedisConnection();
  if (!conn) return false;
  try {
    const key = getAgentLockKey(agentId);
    const result = await conn.set(key, runId, 'PX', JOB_TIMEOUT_MS, 'NX');
    return result === 'OK';
  } catch (err) {
    logger.error(`[ScheduledAgents] Failed to acquire lock for agent ${agentId}:`, err);
    return false;
  }
}

/**
 * Release the per-agent lock only if we still hold it (value matches runId).
 */
async function releaseAgentLock(agentId, runId) {
  const conn = getRedisConnection();
  if (!conn) return;
  try {
    const key = getAgentLockKey(agentId);
    await conn.eval(
      `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`,
      1,
      key,
      runId,
    );
  } catch (err) {
    logger.error(`[ScheduledAgents] Failed to release lock for agent ${agentId}:`, err);
  }
}

/**
 * Fail startup when scheduled agents are enabled but Redis is unavailable.
 * Tied to interface.scheduledAgents from config; respects SCHEDULED_AGENTS_REQUIRE_REDIS=false opt-out.
 * @param {boolean} [schedulerEnabled] - From appConfig?.interfaceConfig?.scheduledAgents. When !== false, Redis is required.
 */
function requireRedisAtStartup(schedulerEnabled = true) {
  if (process.env.SCHEDULED_AGENTS_REQUIRE_REDIS === 'false') return;
  if (schedulerEnabled === false) return;
  if (getRedisConnection()) return;
  throw new Error(
    'Scheduled agents are enabled but Redis is not configured (USE_REDIS/REDIS_URI). ' +
      'Configure Redis, set interface.scheduledAgents: false in librechat.yaml, or set SCHEDULED_AGENTS_REQUIRE_REDIS=false.',
  );
}

/**
 * Add a scheduled run to the queue. Returns immediately.
 * @param {string} runId - ScheduledRun _id (MongoDB ObjectId string)
 * @param {Object} payload - Job payload
 * @param {string} payload.scheduleId
 * @param {string} payload.userId
 * @param {string} payload.agentId
 * @param {string} payload.prompt
 * @param {string} [payload.conversationId]
 * @param {string[]|null} [payload.selectedTools]
 * @returns {Promise<import('bullmq').Job|null>} The added job, or null if queue unavailable
 */
async function enqueueRun(runId, payload) {
  const q = getQueue();
  if (!q) {
    return null;
  }

  try {
    const job = await q.add(
      'run',
      { runId, ...payload },
      { jobId: runId },
    );
    logger.debug(`[ScheduledAgents] Job queued: runId=${runId}`);
    return job;
  } catch (err) {
    logger.error(`[ScheduledAgents] Failed to enqueue job runId=${runId}:`, err);
    throw err;
  }
}

/**
 * Create and start the worker. Call once at server boot when Redis is available.
 */
function startWorker() {
  const connection = getRedisConnection();
  if (!connection) {
    logger.warn(
      '[ScheduledAgents] Redis not available; job queue disabled. Manual/tool-triggered runs use fire-and-forget and may be lost on restart.',
    );
    return;
  }

  if (worker) {
    return;
  }

  const concurrency = getConcurrency();
  worker = new Worker(
    QUEUE_NAME,
    async (job, token) => {
      const { runId, scheduleId, userId, agentId, conversationId, selectedTools } =
        job.data;

      logger.info(`[ScheduledAgents] Processing job: runId=${runId} scheduleId=${scheduleId}`);

      const lockAcquired = await tryAcquireAgentLock(agentId, runId);
      if (!lockAcquired) {
        logger.debug(`[ScheduledAgents] Agent ${agentId} busy, delaying job runId=${runId}`);
        await job.moveToDelayed(Date.now() + AGENT_LOCK_DELAY_MS, token);
        throw new DelayedError();
      }

      try {
        await executeScheduledAgent({
          runId,
          scheduleId,
          userId,
          agentId,
          conversationId: conversationId || undefined,
          selectedTools,
        });
      } finally {
        await releaseAgentLock(agentId, runId);
      }
    },
    {
      connection,
      prefix: getBullPrefix(),
      concurrency,
    },
  );

  worker.on('completed', (job) => {
    logger.debug(`[ScheduledAgents] Job completed: runId=${job.id}`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`[ScheduledAgents] Job failed: runId=${job?.id} error=${err?.message}`, {
      stack: err?.stack,
    });
  });

  worker.on('error', (err) => {
    logger.error('[ScheduledAgents] Worker error:', err);
  });

  logger.info(`[ScheduledAgents] Job queue worker started: queue=${QUEUE_NAME} concurrency=${concurrency}`);
}

/**
 * Stop the worker. Call during shutdown.
 */
async function stopWorker() {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('[ScheduledAgents] Job queue worker stopped');
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
  if (bullConnection) {
    await bullConnection.quit();
    bullConnection = null;
  }
}

/**
 * Check if the job queue is available (Redis + worker).
 */
function isQueueAvailable() {
  return !!getRedisConnection();
}

/**
 * Get or create the queue instance.
 * @returns {import('bullmq').Queue|null}
 */
function getQueue() {
  const connection = getRedisConnection();
  if (!connection) return null;
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection,
      prefix: getBullPrefix(),
      defaultJobOptions: {
        attempts: RETRY_ATTEMPTS,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 24 * 3600 },
        removeOnFail: { age: 7 * 24 * 3600 },
        timeout: JOB_TIMEOUT_MS,
      },
    });
  }
  return queue;
}

/**
 * Per-agent promise chains for when Redis is unavailable.
 * Ensures only one run per agent at a time; different agents can run in parallel.
 */
const agentChains = new Map();

/**
 * Run a scheduled agent when the queue is unavailable (no Redis).
 * Serializes per agentId: same agent waits, different agents run in parallel.
 * @param {string} runId - ScheduledRun _id
 * @param {Object} payload - Same as enqueueRun payload
 * @returns {Promise<void>}
 */
async function runSerializedPerAgent(runId, payload) {
  const { agentId } = payload;
  const prev = agentChains.get(agentId) ?? Promise.resolve();
  const next = prev
    .then(() => executeScheduledAgent({ runId, ...payload }))
    .catch((err) => {
      logger.error(`[ScheduledAgents] Background run failed: runId=${runId}`, err);
    })
    .finally(() => {
      if (agentChains.get(agentId) === next) {
        agentChains.delete(agentId);
      }
    });
  agentChains.set(agentId, next);
  return next;
}

/**
 * Remove a queued run from the BullMQ queue.
 * Fails if the job is already being processed (active).
 * @param {string} runId - ScheduledRun _id (used as jobId)
 * @returns {Promise<{ removed: boolean; error?: string }>}
 */
async function removeRun(runId) {
  const q = getQueue();
  if (!q) {
    return { removed: false, error: 'Queue unavailable' };
  }
  try {
    const job = await Job.fromId(q, runId);
    if (!job) {
      return { removed: false, error: 'Job not found' };
    }
    const state = await job.getState();
    if (state === 'active') {
      return { removed: false, error: 'Job is being processed' };
    }
    await job.remove();
    logger.debug(`[ScheduledAgents] Job removed: runId=${runId}`);
    return { removed: true };
  } catch (err) {
    const errMsg = err?.message || String(err);
    if (errMsg.includes('being processed') || errMsg.includes('active')) {
      return { removed: false, error: 'Job is being processed' };
    }
    logger.error(`[ScheduledAgents] Failed to remove job runId=${runId}:`, err);
    return { removed: false, error: errMsg };
  }
}

module.exports = {
  enqueueRun,
  removeRun,
  runSerializedPerAgent,
  startWorker,
  stopWorker,
  isQueueAvailable,
  requireRedisAtStartup,
  getRedisConnection,
};
