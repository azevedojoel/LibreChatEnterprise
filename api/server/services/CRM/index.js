/**
 * CRM services - Native CRM for DailyThread.
 */
const contactService = require('./contactService');
const organizationService = require('./organizationService');
const dealService = require('./dealService');
const activityService = require('./activityService');
const pipelineService = require('./pipelineService');
const activityLogger = require('./activityLogger');

module.exports = {
  ...contactService,
  ...organizationService,
  ...dealService,
  ...activityService,
  ...pipelineService,
  ...activityLogger,
};
