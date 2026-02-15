const cron = require('node-cron');
const { logger } = require('@librechat/data-schemas');
const { ScheduledAgent } = require('~/db/models');
const { executeScheduledAgent } = require('./executeAgent');

let isLeader = () => Promise.resolve(true);

try {
  const apiPkg = require('@librechat/api');
  if (apiPkg?.isLeader) {
    isLeader = apiPkg.isLeader;
  }
} catch {
  // Fallback: always run (single-instance mode)
}

/**
 * Tick: find due schedules and execute them.
 * Only runs when this instance is the leader (or single instance).
 */
async function processDueSchedules() {
  try {
    const leader = await isLeader();
    if (!leader) {
      return;
    }

    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

    const recurringSchedules = await ScheduledAgent.find({
      enabled: true,
      scheduleType: 'recurring',
      cronExpression: { $exists: true, $ne: null, $ne: '' },
    }).lean();

    const oneOffSchedules = await ScheduledAgent.find({
      enabled: true,
      scheduleType: 'one-off',
      runAt: { $lte: now },
    }).lean();

    const dueRecurring = [];
    let cronParser;
    try {
      cronParser = require('cron-parser');
    } catch {
      logger.warn('[ScheduledAgents] cron-parser not available, skipping recurring');
    }
    if (cronParser) {
      const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
      for (const s of recurringSchedules) {
        try {
          const interval = cronParser.parseExpression(s.cronExpression, {
            currentDate: twoMinutesAgo,
          });
          const next = interval.next().toDate();
          if (next <= now && next >= oneMinuteAgo) {
            dueRecurring.push(s);
          }
        } catch (parseErr) {
          logger.warn(`[ScheduledAgents] Invalid cron ${s.cronExpression} for schedule ${s._id}`);
        }
      }
    }

    const toRun = [...dueRecurring, ...oneOffSchedules];

    for (const schedule of toRun) {
      try {
        await executeScheduledAgent({
          scheduleId: schedule._id.toString(),
          userId: schedule.userId.toString(),
          agentId: schedule.agentId,
          prompt: schedule.prompt,
          conversationId: schedule.conversationId || undefined,
          selectedTools: schedule.selectedTools,
        });

        if (schedule.scheduleType === 'one-off') {
          await ScheduledAgent.findByIdAndUpdate(schedule._id, { $set: { enabled: false } });
        }
      } catch (err) {
        logger.error(`[ScheduledAgents] Error executing schedule ${schedule._id}:`, err);
      }
    }
  } catch (err) {
    logger.error('[ScheduledAgents] Scheduler tick error:', err);
  }
}

let cronTask = null;

/**
 * Start the scheduled agents cron.
 * Runs every minute; only the leader processes due jobs.
 */
function startScheduler() {
  if (cronTask) {
    return;
  }

  cronTask = cron.schedule('* * * * *', processDueSchedules, {
    scheduled: true,
    timezone: 'UTC',
  });

  logger.info('[ScheduledAgents] Scheduler started (runs every minute)');
}

/**
 * Stop the scheduled agents cron.
 */
function stopScheduler() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    logger.info('[ScheduledAgents] Scheduler stopped');
  }
}

module.exports = { startScheduler, stopScheduler, processDueSchedules };
