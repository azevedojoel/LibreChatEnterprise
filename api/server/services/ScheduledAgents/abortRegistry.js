/**
 * In-memory registry for abort controllers of running scheduled agent runs.
 * Used to cancel runs that are actively being processed by the BullMQ worker.
 */
const registry = new Map();

/**
 * Register an abort controller for a run.
 * @param {string} runId - ScheduledRun _id
 * @param {AbortController} abortController
 */
function register(runId, abortController) {
  if (!runId || !abortController) return;
  registry.set(runId, abortController);
}

/**
 * Abort a running run by triggering its abort controller.
 * @param {string} runId - ScheduledRun _id
 * @returns {boolean} - true if abort was triggered, false if run not found
 */
function abort(runId) {
  const controller = registry.get(runId);
  if (!controller) return false;
  try {
    controller.abort();
    return true;
  } catch {
    return false;
  }
}

/**
 * Unregister an abort controller. Call when the run completes (success or error).
 * @param {string} runId - ScheduledRun _id
 */
function unregister(runId) {
  if (runId) registry.delete(runId);
}

module.exports = {
  register,
  abort,
  unregister,
};
