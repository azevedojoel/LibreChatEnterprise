const express = require('express');
const {
  checkAgentAccess,
  listSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  runSchedule,
  listRuns,
  getRun,
  cancelRun,
} = require('~/server/controllers/scheduledAgents');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const router = express.Router();

router.use(requireJwtAuth);
router.use(checkAgentAccess);

/** Runs must be defined before :id to avoid "runs" being captured as id */
router.get('/runs', listRuns);
router.post('/runs/:id/cancel', cancelRun);
router.get('/runs/:id', getRun);

router.get('/', listSchedules);
router.post('/', createSchedule);
router.patch('/:id', updateSchedule);
router.delete('/:id', deleteSchedule);
router.post('/:id/run', runSchedule);

module.exports = router;
