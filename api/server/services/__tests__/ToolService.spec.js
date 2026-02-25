const {
  AgentCapabilities,
  defaultAgentCapabilities,
  Tools,
  Constants,
  isEphemeralAgentId,
} = require('librechat-data-provider');
const { isDestructiveTool } = require('../destructiveTools');

/**
 * Simulates the file_search tool inclusion logic from loadAgentTools / loadToolDefinitionsWrapper.
 * Used to test persistent vs ephemeral agent behavior.
 */
function shouldIncludeFileSearch(agentId, ephemeralAgent, checkCapability) {
  const isPersistentAgent = !isEphemeralAgentId(agentId);
  if (isPersistentAgent) {
    if (ephemeralAgent?.file_search === false) return false;
    return checkCapability(AgentCapabilities.file_search);
  }
  if (ephemeralAgent != null && 'file_search' in ephemeralAgent) {
    return ephemeralAgent.file_search === true;
  }
  return checkCapability(AgentCapabilities.file_search);
}

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
      expect(defaultAgentCapabilities).toContain(AgentCapabilities.manage_scheduling);
      expect(defaultAgentCapabilities).toContain(AgentCapabilities.inbound_email);
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

  describe('persistent vs ephemeral agent tool filtering', () => {
    const checkCapabilityEnabled = (capability) =>
      new Set([AgentCapabilities.file_search]).has(capability);
    const checkCapabilityDisabled = () => false;

    it('persistent agent + ephemeralAgent undefined → tool included when capability enabled', () => {
      const agentId = 'agent_abc123';
      const ephemeralAgent = undefined;

      expect(shouldIncludeFileSearch(agentId, ephemeralAgent, checkCapabilityEnabled)).toBe(true);
    });

    it('persistent agent + ephemeralAgent.file_search: false → tool excluded', () => {
      const agentId = 'agent_abc123';
      const ephemeralAgent = { file_search: false };

      expect(shouldIncludeFileSearch(agentId, ephemeralAgent, checkCapabilityEnabled)).toBe(false);
    });

    it('persistent agent + ephemeralAgent.file_search: false → excluded even when capability enabled', () => {
      const agentId = 'agent_abc123';
      const ephemeralAgent = { file_search: false };

      expect(shouldIncludeFileSearch(agentId, ephemeralAgent, checkCapabilityEnabled)).toBe(false);
    });

    it('ephemeral agent + ephemeralAgent.file_search: false → tool excluded', () => {
      const agentId = 'ephemeral';
      const ephemeralAgent = { file_search: false };

      expect(shouldIncludeFileSearch(agentId, ephemeralAgent, checkCapabilityEnabled)).toBe(false);
    });

    it('ephemeral agent + no ephemeralAgent → uses checkCapability as fallback', () => {
      const agentId = 'ephemeral';
      const ephemeralAgent = undefined;

      // Ephemeral with no ephemeralAgent: falls through to checkCapability
      expect(shouldIncludeFileSearch(agentId, ephemeralAgent, checkCapabilityEnabled)).toBe(true);
      expect(shouldIncludeFileSearch(agentId, ephemeralAgent, checkCapabilityDisabled)).toBe(false);
    });

    it('ephemeral agent + ephemeralAgent.file_search: true → tool included', () => {
      const agentId = 'ephemeral';
      const ephemeralAgent = { file_search: true };

      expect(shouldIncludeFileSearch(agentId, ephemeralAgent, checkCapabilityDisabled)).toBe(true);
    });

    it('ephemeral agent + empty string id treated as ephemeral', () => {
      const agentId = '';
      const ephemeralAgent = { file_search: false };

      expect(shouldIncludeFileSearch(agentId, ephemeralAgent, checkCapabilityEnabled)).toBe(false);
    });
  });
});

describe('ToolService - isDestructiveTool', () => {
  it('returns true for execute_code and code_interpreter', () => {
    expect(isDestructiveTool(Tools.execute_code)).toBe(true);
    expect(isDestructiveTool('code_interpreter')).toBe(true);
  });

  it('returns true for CRM tools', () => {
    expect(isDestructiveTool(Tools.crm_create_contact)).toBe(true);
    expect(isDestructiveTool(Tools.crm_update_contact)).toBe(true);
    expect(isDestructiveTool(Tools.crm_soft_delete_contact)).toBe(true);
    expect(isDestructiveTool(Tools.crm_create_deal)).toBe(true);
  });

  it('returns true for schedule tools', () => {
    expect(isDestructiveTool(Tools.create_schedule)).toBe(true);
    expect(isDestructiveTool(Tools.delete_schedule)).toBe(true);
    expect(isDestructiveTool(Tools.update_schedule)).toBe(true);
    expect(isDestructiveTool(Tools.run_schedule)).toBe(true);
  });

  it('returns true for Gmail and Calendar tools', () => {
    expect(isDestructiveTool('gmail.send')).toBe(true);
    expect(isDestructiveTool('gmail_send')).toBe(true);
    expect(isDestructiveTool('calendar.createEvent')).toBe(true);
    expect(isDestructiveTool('calendar_create_event')).toBe(true);
  });

  it('returns false for non-destructive tools', () => {
    expect(isDestructiveTool(Tools.web_search)).toBe(false);
    expect(isDestructiveTool(Tools.file_search)).toBe(false);
    expect(isDestructiveTool('unknown_tool')).toBe(false);
  });

  it('handles MCP tool names - extracts base name before _mcp_', () => {
    const mcpDelimiter = Constants.mcp_delimiter || '_mcp_';
    expect(isDestructiveTool(`gmail_send${mcpDelimiter}GoogleWorkspace`)).toBe(true);
    expect(isDestructiveTool(`calendar_create_event${mcpDelimiter}ServerName`)).toBe(true);
    expect(isDestructiveTool(`web_search${mcpDelimiter}Server`)).toBe(false);
  });

  it('handles null, undefined, empty string', () => {
    expect(isDestructiveTool(null)).toBe(false);
    expect(isDestructiveTool(undefined)).toBe(false);
    expect(isDestructiveTool('')).toBe(false);
  });
});
