/**
 * Workflow job queue - enqueues workflow runs for scheduled execution.
 * Reuses Redis connection from the main job queue; uses a separate queue name.
 */
const { Queue, Worker } = require('bullmq');
const { logger } = require('@librechat/data-schemas');
const { cacheConfig } = require('@librechat/api');
const { executeWorkflow } = require('./executeWorkflow');

const QUEUE_NAME = 'workflow-scheduled-runs';
const DEFAULT_CONCURRENCY = 2;
const JOB_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes for workflows
const RETRY_ATTEMPTS = 2;

let workflowQueue = null;
let workflowWorker = null;

function getRedisConnection() {
  try {
    const jobQueue = require('./jobQueue');
    return jobQueue.getRedisConnection?.() ?? null;
  } catch {
    return null;
  }
}

function getBullPrefix() {
  if (cacheConfig?.REDIS_KEY_PREFIX && cacheConfig.REDIS_KEY_PREFIX.length > 0) {
    return `${cacheConfig.REDIS_KEY_PREFIX}${cacheConfig.GLOBAL_PREFIX_SEPARATOR}workflow-agents`;
  }
  return 'bull-workflow';
}

/**
 * @param {string} runId - WorkflowRun _id
 * @param {Object} payload - { workflowId, userId }
 */
async function enqueueWorkflowRun(runId, payload) {
  const q = getWorkflowQueue();
  if (!q) return null;

  try {
    await q.add(
      'workflow_run',
      { runId, ...payload },
      { jobId: runId },
    );
    logger.debug(`[WorkflowScheduling] Job queued: runId=${runId}`);
    return true;
  } catch (err) {
    logger.error(`[WorkflowScheduling] Failed to enqueue runId=${runId}:`, err);
    throw err;
  }
}

function getWorkflowQueue() {
  const connection = getRedisConnection();
  if (!connection) return null;
  if (!workflowQueue) {
    workflowQueue = new Queue(QUEUE_NAME, {
      connection,
      prefix: getBullPrefix(),
      defaultJobOptions: {
        attempts: RETRY_ATTEMPTS,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: { age: 24 * 3600 },
        removeOnFail: { age: 7 * 24 * 3600 },
        timeout: JOB_TIMEOUT_MS,
      },
    });
  }
  return workflowQueue;
}

function isQueueAvailable() {
  return !!getRedisConnection();
}

function startWorkflowWorker() {
  const connection = getRedisConnection();
  if (!connection) {
    logger.warn('[WorkflowScheduling] Redis not available; workflow job queue disabled.');
    return;
  }

  if (workflowWorker) return;

  workflowWorker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { runId, workflowId, userId } = job.data;
      logger.info(`[WorkflowScheduling] Processing job: runId=${runId} workflowId=${workflowId}`);
      await executeWorkflow({ workflowId, userId, runId });
    },
    {
      connection,
      prefix: getBullPrefix(),
      concurrency: DEFAULT_CONCURRENCY,
    },
  );

  workflowWorker.on('completed', (job) => {
    logger.debug(`[WorkflowScheduling] Job completed: runId=${job.id}`);
  });

  workflowWorker.on('failed', (job, err) => {
    logger.error(`[WorkflowScheduling] Job failed: runId=${job?.id} error=${err?.message}`, {
      stack: err?.stack,
    });
  });

  workflowWorker.on('error', (err) => {
    logger.error('[WorkflowScheduling] Worker error:', err);
  });

  logger.info(`[WorkflowScheduling] Worker started: queue=${QUEUE_NAME} concurrency=${DEFAULT_CONCURRENCY}`);
}

async function stopWorkflowWorker() {
  if (workflowWorker) {
    await workflowWorker.close();
    workflowWorker = null;
    logger.info('[WorkflowScheduling] Worker stopped');
  }
  if (workflowQueue) {
    await workflowQueue.close();
    workflowQueue = null;
  }
}

/**
 * Run workflow in background when queue unavailable (no Redis).
 */
const workflowChains = new Map();

async function runWorkflowSerialized(runId, payload) {
  const { workflowId } = payload;
  const key = workflowId;
  const prev = workflowChains.get(key) ?? Promise.resolve();
  const next = prev
    .then(() => executeWorkflow({ ...payload, runId }))
    .catch((err) => {
      logger.error(`[WorkflowScheduling] Background run failed: runId=${runId}`, err);
    })
    .finally(() => {
      if (workflowChains.get(key) === next) {
        workflowChains.delete(key);
      }
    });
  workflowChains.set(key, next);
  return next;
}

module.exports = {
  enqueueWorkflowRun,
  isQueueAvailable,
  startWorkflowWorker,
  stopWorkflowWorker,
  runWorkflowSerialized,
};
