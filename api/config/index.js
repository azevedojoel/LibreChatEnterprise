const { EventSource } = require('eventsource');
const { Time } = require('librechat-data-provider');
const {
  MCPManager,
  FlowStateManager,
  MCPServersRegistry,
  OAuthReconnectionManager,
} = require('@librechat/api');
const logger = require('./winston');

global.EventSource = EventSource;

/** @type {MCPManager} */
let flowManager = null;

/**
 * @param {Keyv} flowsCache
 * @returns {FlowStateManager}
 */
function getFlowStateManager(flowsCache) {
  if (!flowManager) {
    flowManager = new FlowStateManager(flowsCache, {
      // 10 min TTL allows users adequate time to complete OAuth (e.g. find inline link, authorize)
      ttl: Time.TEN_MINUTES,
    });
  }
  return flowManager;
}

module.exports = {
  logger,
  createMCPServersRegistry: MCPServersRegistry.createInstance,
  getMCPServersRegistry: MCPServersRegistry.getInstance,
  createMCPManager: MCPManager.createInstance,
  getMCPManager: MCPManager.getInstance,
  getFlowStateManager,
  createOAuthReconnectionManager: OAuthReconnectionManager.createInstance,
  getOAuthReconnectionManager: OAuthReconnectionManager.getInstance,
};
