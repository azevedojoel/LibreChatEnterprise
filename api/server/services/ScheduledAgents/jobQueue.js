/**
 * BullMQ job queue for scheduled agent runs.
 * Queues run_schedule requests so they execute async; caller gets runId immediately.
 *
 * Uses a dedicated Redis connection without keyPrefix - BullMQ requires unprefixed
 * ioredis and provides its own prefix option.
 */
const IoRedis = require('ioredis');
const { Queue, Worker } = require('bullmq');
const { logger } = require('@librechat/data-schemas');
const { cacheConfig, isEnabled } = require('@librechat/api');
const { executeScheduledAgent } = require('./executeAgent');

const QUEUE_NAME = 'scheduled-agent-runs';
const DEFAULT_CONCURRENCY = 3;
const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 20;
const JOB_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const RETRY_ATTEMPTS = 3;

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
  const connection = getRedisConnection();
  if (!connection) {
    return null;
  }

  try {
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

    const job = await queue.add(
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
    async (job) => {
      const { runId, scheduleId, userId, agentId, prompt, conversationId, selectedTools } =
        job.data;

      logger.info(`[ScheduledAgents] Processing job: runId=${runId} scheduleId=${scheduleId}`);

      await executeScheduledAgent({
        runId,
        scheduleId,
        userId,
        agentId,
        prompt,
        conversationId: conversationId || undefined,
        selectedTools,
      });
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

module.exports = {
  enqueueRun,
  startWorker,
  stopWorker,
  isQueueAvailable,
  requireRedisAtStartup,
};
