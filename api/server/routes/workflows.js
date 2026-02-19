const express = require('express');
const {
  checkWorkflowAccess,
  checkAgentAccess,
  listWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  runWorkflow,
  listWorkflowRuns,
  cancelWorkflowRun,
  listWorkflowSchedules,
  createWorkflowSchedule,
  updateWorkflowSchedule,
  deleteWorkflowSchedule,
  runWorkflowSchedule,
} = require('~/server/controllers/workflows');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const router = express.Router();

router.use(requireJwtAuth);
router.use(checkWorkflowAccess);
router.use(checkAgentAccess);

router.get('/', listWorkflows);
router.get('/:id/runs', listWorkflowRuns);
router.post('/:id/runs/:runId/cancel', cancelWorkflowRun);
router.get('/:id/schedules', listWorkflowSchedules);
router.post('/:id/schedules', createWorkflowSchedule);
router.patch('/:id/schedules/:scheduleId', updateWorkflowSchedule);
router.delete('/:id/schedules/:scheduleId', deleteWorkflowSchedule);
router.post('/:id/schedules/:scheduleId/run', runWorkflowSchedule);
router.get('/:id', getWorkflow);
router.post('/', createWorkflow);
router.post('/:id/run', runWorkflow);
router.patch('/:id', updateWorkflow);
router.delete('/:id', deleteWorkflow);

module.exports = router;
