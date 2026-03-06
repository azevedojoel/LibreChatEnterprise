/**
 * BullMQ job queue for inbound Telegram processing.
 * Queues Telegram webhook payloads for async processing; webhook always returns 200.
 */
const IoRedis = require('ioredis');
const { Queue, Worker } = require('bullmq');
const { logger } = require('@librechat/data-schemas');
const { cacheConfig } = require('@librechat/api');
const { processInboundTelegram } = require('./processInboundTelegram');

const QUEUE_NAME = 'inbound-telegram';
const DEFAULT_CONCURRENCY = 2;
const JOB_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const RETRY_ATTEMPTS = 3;

let bullConnection = null;
let queue = null;
let worker = null;

function getConcurrency() {
  const raw = parseInt(process.env.INBOUND_TELEGRAM_QUEUE_CONCURRENCY, 10);
  if (Number.isNaN(raw)) return DEFAULT_CONCURRENCY;
  return Math.max(1, Math.min(10, raw));
}

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
    maxRetriesPerRequest: null,
    enableOfflineQueue: cacheConfig.REDIS_ENABLE_OFFLINE_QUEUE,
    connectTimeout: cacheConfig.REDIS_CONNECT_TIMEOUT,
  };

  const useCluster = urls.length > 1 || cacheConfig.USE_REDIS_CLUSTER;
  if (useCluster) {
    bullConnection = new IoRedis.Cluster(
      urls.map((url) => ({ host: url.hostname, port: parseInt(url.port, 10) || 6379 })),
      {
        redisOptions,
        ...(cacheConfig.REDIS_USE_ALTERNATIVE_DNS_LOOKUP
          ? { dnsLookup: (address, callback) => callback(null, address) }
          : {}),
      },
    );
  } else {
    bullConnection = new IoRedis(cacheConfig.REDIS_URI, redisOptions);
  }

  return bullConnection;
}

function getBullPrefix() {
  if (cacheConfig.REDIS_KEY_PREFIX && cacheConfig.REDIS_KEY_PREFIX.length > 0) {
    return `${cacheConfig.REDIS_KEY_PREFIX}${cacheConfig.GLOBAL_PREFIX_SEPARATOR}inbound-telegram`;
  }
  return 'bull';
}

async function enqueueInboundTelegram(payload) {
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

    const job = await queue.add('process', { payload });
    logger.debug(`[InboundTelegram] Job queued: jobId=${job.id}`);
    return job;
  } catch (err) {
    logger.error('[InboundTelegram] Failed to enqueue job:', err);
    return null;
  }
}

function startInboundTelegramWorker() {
  const connection = getRedisConnection();
  if (!connection) {
    logger.warn(
      '[InboundTelegram] Redis not available; inbound Telegram queue disabled. Webhook returns 200 but updates will not be processed.',
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
      try {
        const { payload } = job.data;
        logger.info(`[InboundTelegram] Processing job: jobId=${job.id}`);
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error(`Job timed out after ${JOB_TIMEOUT_MS / 1000}s`)),
            JOB_TIMEOUT_MS,
          );
        });
        try {
          await Promise.race([processInboundTelegram(payload), timeoutPromise]);
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (err) {
        logger.error(`[InboundTelegram] Job handler error: jobId=${job?.id}`, {
          message: err?.message,
          stack: err?.stack,
        });
        throw err;
      }
    },
    {
      connection,
      prefix: getBullPrefix(),
      concurrency,
    },
  );

  worker.on('completed', (job) => {
    logger.debug(`[InboundTelegram] Job completed: jobId=${job.id}`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`[InboundTelegram] Job failed: jobId=${job?.id} error=${err?.message}`, {
      stack: err?.stack,
    });
  });

  worker.on('error', (err) => {
    logger.error('[InboundTelegram] Worker error:', err);
  });

  logger.info(
    `[InboundTelegram] Job queue worker started: queue=${QUEUE_NAME} concurrency=${concurrency}`,
  );
}

module.exports = {
  enqueueInboundTelegram,
  startInboundTelegramWorker,
};
