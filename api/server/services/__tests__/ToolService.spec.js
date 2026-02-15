const { AgentCapabilities, defaultAgentCapabilities, Tools } = require('librechat-data-provider');

/**
 * Simulates ephemeralAgent.tools filtering from loadToolDefinitionsWrapper and loadAgentTools.
 * When ephemeralAgent.tools is an array, only tools in that set are kept.
 */
function filterToolsByEphemeralAgent(toolsToFilter, ephemeralAgent) {
  if (!Array.isArray(ephemeralAgent?.tools)) {
    return toolsToFilter;
  }
  const toolsSet = new Set(ephemeralAgent.tools);
  return toolsToFilter.filter((tool) => toolsSet.has(tool));
}

/**
 * Tests for ToolService capability checking logic.
 * The actual loadAgentTools function has many dependencies, so we test
 * the capability checking logic in isolation.
 */
describe('ToolService - Capability Checking', () => {
  describe('checkCapability logic', () => {
    /**
     * Simulates the checkCapability function from loadAgentTools
     */
    const createCheckCapability = (enabledCapabilities, logger = { warn: jest.fn() }) => {
      return (capability) => {
        const enabled = enabledCapabilities.has(capability);
        if (!enabled) {
          const isToolCapability = [
            AgentCapabilities.file_search,
            AgentCapabilities.execute_code,
            AgentCapabilities.web_search,
          ].includes(capability);
          const suffix = isToolCapability ? ' despite configured tool.' : '.';
          logger.warn(`Capability "${capability}" disabled${suffix}`);
        }
        return enabled;
      };
    };

    it('should return true when capability is enabled', () => {
      const enabledCapabilities = new Set([AgentCapabilities.deferred_tools]);
      const checkCapability = createCheckCapability(enabledCapabilities);

      expect(checkCapability(AgentCapabilities.deferred_tools)).toBe(true);
    });

    it('should return false when capability is not enabled', () => {
      const enabledCapabilities = new Set([]);
      const checkCapability = createCheckCapability(enabledCapabilities);

      expect(checkCapability(AgentCapabilities.deferred_tools)).toBe(false);
    });

    it('should log warning with "despite configured tool" for tool capabilities', () => {
      const logger = { warn: jest.fn() };
      const enabledCapabilities = new Set([]);
      const checkCapability = createCheckCapability(enabledCapabilities, logger);

      checkCapability(AgentCapabilities.file_search);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('despite configured tool'));

      logger.warn.mockClear();
      checkCapability(AgentCapabilities.execute_code);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('despite configured tool'));

      logger.warn.mockClear();
      checkCapability(AgentCapabilities.web_search);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('despite configured tool'));
    });

    it('should log warning without "despite configured tool" for non-tool capabilities', () => {
      const logger = { warn: jest.fn() };
      const enabledCapabilities = new Set([]);
      const checkCapability = createCheckCapability(enabledCapabilities, logger);

      checkCapability(AgentCapabilities.deferred_tools);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Capability "deferred_tools" disabled.'),
      );
      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('despite configured tool'),
      );

      logger.warn.mockClear();
      checkCapability(AgentCapabilities.tools);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Capability "tools" disabled.'),
      );
      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('despite configured tool'),
      );

      logger.warn.mockClear();
      checkCapability(AgentCapabilities.actions);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Capability "actions" disabled.'),
      );
    });

    it('should not log warning when capability is enabled', () => {
      const logger = { warn: jest.fn() };
      const enabledCapabilities = new Set([
        AgentCapabilities.deferred_tools,
        AgentCapabilities.file_search,
      ]);
      const checkCapability = createCheckCapability(enabledCapabilities, logger);

      checkCapability(AgentCapabilities.deferred_tools);
      checkCapability(AgentCapabilities.file_search);

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('defaultAgentCapabilities', () => {
    it('should include deferred_tools capability by default', () => {
      expect(defaultAgentCapabilities).toContain(AgentCapabilities.deferred_tools);
    });

    it('should include all expected default capabilities', () => {
      expect(defaultAgentCapabilities).toContain(AgentCapabilities.execute_code);
      expect(defaultAgentCapabilities).toContain(AgentCapabilities.file_search);
      expect(defaultAgentCapabilities).toContain(AgentCapabilities.web_search);
      expect(defaultAgentCapabilities).toContain(AgentCapabilities.artifacts);
      expect(defaultAgentCapabilities).toContain(AgentCapabilities.actions);
      expect(defaultAgentCapabilities).toContain(AgentCapabilities.context);
      expect(defaultAgentCapabilities).toContain(AgentCapabilities.tools);
      expect(defaultAgentCapabilities).toContain(AgentCapabilities.chain);
      expect(defaultAgentCapabilities).toContain(AgentCapabilities.ocr);
    });
  });

  describe('deferredToolsEnabled integration', () => {
    it('should correctly determine deferredToolsEnabled from capabilities set', () => {
      const createCheckCapability = (enabledCapabilities) => {
        return (capability) => enabledCapabilities.has(capability);
      };

      // When deferred_tools is in capabilities
      const withDeferred = new Set([AgentCapabilities.deferred_tools, AgentCapabilities.tools]);
      const checkWithDeferred = createCheckCapability(withDeferred);
      expect(checkWithDeferred(AgentCapabilities.deferred_tools)).toBe(true);

      // When deferred_tools is NOT in capabilities
      const withoutDeferred = new Set([AgentCapabilities.tools, AgentCapabilities.actions]);
      const checkWithoutDeferred = createCheckCapability(withoutDeferred);
      expect(checkWithoutDeferred(AgentCapabilities.deferred_tools)).toBe(false);
    });

    it('should use defaultAgentCapabilities when no capabilities configured', () => {
      // Simulates the fallback behavior in loadAgentTools
      const endpointsConfig = {}; // No capabilities configured
      const enabledCapabilities = new Set(
        endpointsConfig?.capabilities ?? defaultAgentCapabilities,
      );

      expect(enabledCapabilities.has(AgentCapabilities.deferred_tools)).toBe(true);
    });
  });

  describe('ephemeralAgent.tools filtering', () => {
    it('should filter to only tools in ephemeralAgent.tools when array provided', () => {
      const toolsToFilter = [Tools.file_search, Tools.web_search, 'search_mcp_github'];
      const ephemeralAgent = { tools: [Tools.file_search] };

      const result = filterToolsByEphemeralAgent(toolsToFilter, ephemeralAgent);

      expect(result).toEqual([Tools.file_search]);
    });

    it('should return empty array when ephemeralAgent.tools is empty', () => {
      const toolsToFilter = [Tools.file_search, Tools.web_search];
      const ephemeralAgent = { tools: [] };

      const result = filterToolsByEphemeralAgent(toolsToFilter, ephemeralAgent);

      expect(result).toEqual([]);
    });

    it('should not filter when ephemeralAgent.tools is undefined', () => {
      const toolsToFilter = [Tools.file_search, 'search_mcp_github'];
      const ephemeralAgent = {};

      const result = filterToolsByEphemeralAgent(toolsToFilter, ephemeralAgent);

      expect(result).toEqual(toolsToFilter);
    });

    it('should not filter when ephemeralAgent is null or undefined', () => {
      const toolsToFilter = [Tools.file_search, Tools.execute_code];

      expect(filterToolsByEphemeralAgent(toolsToFilter, null)).toEqual(toolsToFilter);
      expect(filterToolsByEphemeralAgent(toolsToFilter, undefined)).toEqual(toolsToFilter);
    });

    it('should filter MCP tool IDs correctly by ephemeralAgent.tools', () => {
      const mcpToolId = `search_mcp_github`;
      const toolsToFilter = [Tools.file_search, mcpToolId, 'list_files_mcp_Google-Workspace'];
      const ephemeralAgent = { tools: [mcpToolId] };

      const result = filterToolsByEphemeralAgent(toolsToFilter, ephemeralAgent);

      expect(result).toEqual([mcpToolId]);
    });
  });
});
