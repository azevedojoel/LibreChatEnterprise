import type { AgentToolOptions } from 'librechat-data-provider';
import type { GenericTool } from '@librechat/agents';
import type { LCToolRegistry } from './classification';
import {
  buildToolRegistryFromAgentOptions,
  agentHasProgrammaticTools,
  buildToolClassification,
  getServerNameFromTool,
  agentHasDeferredTools,
  isToolSearchTool,
} from './classification';
import { Constants } from 'librechat-data-provider';

describe('classification.ts', () => {
  describe('isToolSearchTool', () => {
    it('should return true for tool_search', () => {
      expect(isToolSearchTool('tool_search')).toBe(true);
    });

    it('should return false for tool_search_mcp_* (upstream uses single tool_search only)', () => {
      expect(isToolSearchTool('tool_search_mcp_GitHub')).toBe(false);
      expect(isToolSearchTool('tool_search_mcp_github')).toBe(false);
    });

    it('should return false for other tools', () => {
      expect(isToolSearchTool('list_commits_mcp_github')).toBe(false);
      expect(isToolSearchTool('execute_code')).toBe(false);
    });
  });

  describe('getServerNameFromTool', () => {
    it('should extract server name from MCP tool name', () => {
      const result = getServerNameFromTool('drive.search_mcp_Google-Workspace');
      expect(result).toBe('Google-Workspace');
    });

    it('should return undefined for non-MCP tool', () => {
      const result = getServerNameFromTool('simple_tool');
      expect(result).toBeUndefined();
    });

    it('should handle multiple delimiters', () => {
      const result = getServerNameFromTool('some_tool_mcp_Server_Name');
      expect(result).toBe('Server_Name');
    });
  });

  describe('buildToolRegistryFromAgentOptions', () => {
    it('should use agent tool options for defer_loading', () => {
      const tools = [
        { name: 'tool1', description: 'Tool 1' },
        { name: 'tool2', description: 'Tool 2' },
      ];

      const agentToolOptions: AgentToolOptions = {
        tool1: { defer_loading: true },
        tool2: { defer_loading: false },
      };

      const registry = buildToolRegistryFromAgentOptions(tools, agentToolOptions);

      expect(registry.get('tool1')?.defer_loading).toBe(true);
      expect(registry.get('tool2')?.defer_loading).toBe(false);
    });

    it('should default defer_loading to true for MCP tools when not specified', () => {
      const tools = [{ name: 'tool1', description: 'Tool 1' }];

      const agentToolOptions: AgentToolOptions = {};

      const registry = buildToolRegistryFromAgentOptions(tools, agentToolOptions);

      expect(registry.get('tool1')?.defer_loading).toBe(true);
    });

    it('should use agent allowed_callers when specified', () => {
      const tools = [{ name: 'tool1', description: 'Tool 1' }];

      const agentToolOptions: AgentToolOptions = {
        tool1: { allowed_callers: ['code_execution'] },
      };

      const registry = buildToolRegistryFromAgentOptions(tools, agentToolOptions);

      expect(registry.get('tool1')?.allowed_callers).toEqual(['code_execution']);
    });

    it('should default allowed_callers to direct when not specified', () => {
      const tools = [{ name: 'tool1', description: 'Tool 1' }];

      const agentToolOptions: AgentToolOptions = {
        tool1: { defer_loading: true },
      };

      const registry = buildToolRegistryFromAgentOptions(tools, agentToolOptions);

      expect(registry.get('tool1')?.allowed_callers).toEqual(['direct']);
    });
  });

  describe('agentHasDeferredTools', () => {
    it('should return true when registry has deferred tools', () => {
      const registry: LCToolRegistry = new Map([
        ['tool1', { name: 'tool1', allowed_callers: ['direct'], defer_loading: true }],
        ['tool2', { name: 'tool2', allowed_callers: ['direct'], defer_loading: false }],
      ]);

      expect(agentHasDeferredTools(registry)).toBe(true);
    });

    it('should return false when no tools are deferred', () => {
      const registry: LCToolRegistry = new Map([
        ['tool1', { name: 'tool1', allowed_callers: ['direct'], defer_loading: false }],
        ['tool2', { name: 'tool2', allowed_callers: ['direct'], defer_loading: false }],
      ]);

      expect(agentHasDeferredTools(registry)).toBe(false);
    });

    it('should return false for empty registry', () => {
      const registry: LCToolRegistry = new Map();
      expect(agentHasDeferredTools(registry)).toBe(false);
    });
  });

  describe('agentHasProgrammaticTools', () => {
    it('should return true when registry has programmatic tools', () => {
      const registry: LCToolRegistry = new Map([
        ['tool1', { name: 'tool1', allowed_callers: ['code_execution'], defer_loading: false }],
      ]);

      expect(agentHasProgrammaticTools(registry)).toBe(true);
    });

    it('should return true for dual context tools', () => {
      const registry: LCToolRegistry = new Map([
        [
          'tool1',
          { name: 'tool1', allowed_callers: ['direct', 'code_execution'], defer_loading: false },
        ],
      ]);

      expect(agentHasProgrammaticTools(registry)).toBe(true);
    });

    it('should return false when no programmatic tools', () => {
      const registry: LCToolRegistry = new Map([
        ['tool1', { name: 'tool1', allowed_callers: ['direct'], defer_loading: false }],
      ]);

      expect(agentHasProgrammaticTools(registry)).toBe(false);
    });
  });

  describe('buildToolClassification with deferredToolsEnabled', () => {
    const mockLoadAuthValues = jest.fn().mockResolvedValue({});

    const createMCPTool = (name: string, description?: string) =>
      ({
        name,
        description,
        mcp: true,
        mcpJsonSchema: { type: 'object', properties: {} },
      }) as unknown as GenericTool;

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return hasDeferredTools: false when deferredToolsEnabled is false', async () => {
      const loadedTools: GenericTool[] = [createMCPTool('tool1'), createMCPTool('tool2')];

      const agentToolOptions: AgentToolOptions = {
        tool1: { defer_loading: true },
        tool2: { defer_loading: true },
      };

      const result = await buildToolClassification({
        loadedTools,
        userId: 'user1',
        agentId: 'agent1',
        agentToolOptions,
        deferredToolsEnabled: false,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.hasDeferredTools).toBe(false);
      expect(result.additionalTools.length).toBe(0);
    });

    it('should clear defer_loading from all tools when deferredToolsEnabled is false', async () => {
      const loadedTools: GenericTool[] = [createMCPTool('tool1'), createMCPTool('tool2')];

      const agentToolOptions: AgentToolOptions = {
        tool1: { defer_loading: true },
        tool2: { defer_loading: true },
      };

      const result = await buildToolClassification({
        loadedTools,
        userId: 'user1',
        agentId: 'agent1',
        agentToolOptions,
        deferredToolsEnabled: false,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.toolRegistry).toBeDefined();
      expect(result.toolRegistry?.get('tool1')?.defer_loading).toBe(false);
      expect(result.toolRegistry?.get('tool2')?.defer_loading).toBe(false);
    });

    it('should preserve defer_loading when deferredToolsEnabled is true', async () => {
      const loadedTools: GenericTool[] = [createMCPTool('tool1'), createMCPTool('tool2')];

      const agentToolOptions: AgentToolOptions = {
        tool1: { defer_loading: true },
        tool2: { defer_loading: false },
      };

      const result = await buildToolClassification({
        loadedTools,
        userId: 'user1',
        agentId: 'agent1',
        agentToolOptions,
        deferredToolsEnabled: true,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.hasDeferredTools).toBe(true);
      expect(result.toolRegistry?.get('tool1')?.defer_loading).toBe(true);
      expect(result.toolRegistry?.get('tool2')?.defer_loading).toBe(false);
    });

    it('should create tool_search when deferredToolsEnabled is true and has deferred tools', async () => {
      const loadedTools: GenericTool[] = [
        createMCPTool('list_commits_mcp_github'),
      ];

      const agentToolOptions: AgentToolOptions = {
        list_commits_mcp_github: { defer_loading: true },
      };

      const result = await buildToolClassification({
        loadedTools,
        userId: 'user1',
        agentId: 'agent1',
        agentToolOptions,
        deferredToolsEnabled: true,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.hasDeferredTools).toBe(true);
      expect(
        result.additionalTools.some((t) => t.name === Constants.TOOL_SEARCH),
      ).toBe(true);
    });

    it('should use rich tool_search description from createToolSearch (not minimal override)', async () => {
      const loadedTools: GenericTool[] = [
        createMCPTool('list_commits_mcp_github'),
      ];

      const agentToolOptions: AgentToolOptions = {
        list_commits_mcp_github: { defer_loading: true },
      };

      const result = await buildToolClassification({
        loadedTools,
        userId: 'user1',
        agentId: 'agent1',
        agentToolOptions,
        deferredToolsEnabled: true,
        loadAuthValues: mockLoadAuthValues,
      });

      const toolSearchDef = result.toolDefinitions.find(
        (d) => d.name === Constants.TOOL_SEARCH,
      );
      const toolSearchTool = result.additionalTools.find(
        (t) => t.name === Constants.TOOL_SEARCH,
      );

      const description = toolSearchDef?.description ?? toolSearchTool?.description ?? '';
      expect(description).toContain('Deferred tools');
      expect(description).toContain('search');
      expect(description).not.toBe(
        'Searches deferred tools using BM25 ranking. Multi-word queries supported.',
      );
    });

    it('should NOT create tool search when deferredToolsEnabled is false', async () => {
      const loadedTools: GenericTool[] = [
        createMCPTool('list_commits_mcp_github'),
      ];

      const agentToolOptions: AgentToolOptions = {
        list_commits_mcp_github: { defer_loading: true },
      };

      const result = await buildToolClassification({
        loadedTools,
        userId: 'user1',
        agentId: 'agent1',
        agentToolOptions,
        deferredToolsEnabled: false,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.hasDeferredTools).toBe(false);
      expect(
        result.additionalTools.some((t) => isToolSearchTool(t.name)),
      ).toBe(false);
    });

    it('should default deferredToolsEnabled to true when not specified', async () => {
      const loadedTools: GenericTool[] = [createMCPTool('tool1')];

      const agentToolOptions: AgentToolOptions = {
        tool1: { defer_loading: true },
      };

      const result = await buildToolClassification({
        loadedTools,
        userId: 'user1',
        agentId: 'agent1',
        agentToolOptions,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.hasDeferredTools).toBe(true);
    });

    it('should default MCP tools to deferred when no agentToolOptions provided', async () => {
      const loadedTools: GenericTool[] = [
        createMCPTool('list_commits_mcp_github'),
        createMCPTool('search_code_mcp_github'),
      ];

      const result = await buildToolClassification({
        loadedTools,
        userId: 'user1',
        agentId: 'agent1',
        deferredToolsEnabled: true,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.hasDeferredTools).toBe(true);
      expect(
        result.toolRegistry?.get('list_commits_mcp_github')?.defer_loading,
      ).toBe(true);
      expect(
        result.toolRegistry?.get('search_code_mcp_github')?.defer_loading,
      ).toBe(true);
      expect(
        result.additionalTools.some((t) => t.name === Constants.TOOL_SEARCH),
      ).toBe(true);
    });

    it('should return early when no MCP tools are present', async () => {
      const loadedTools: GenericTool[] = [
        { name: 'regular_tool', mcp: false } as unknown as GenericTool,
      ];

      const result = await buildToolClassification({
        loadedTools,
        userId: 'user1',
        agentId: 'agent1',
        deferredToolsEnabled: true,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.toolRegistry).toBeUndefined();
      expect(result.hasDeferredTools).toBe(false);
      expect(result.additionalTools.length).toBe(0);
    });
  });

  describe('buildToolClassification with definitionsOnly', () => {
    const mockLoadAuthValues = jest.fn().mockResolvedValue({});

    const createMCPTool = (name: string, description?: string) =>
      ({
        name,
        description,
        mcp: true,
        mcpJsonSchema: { type: 'object', properties: {} },
      }) as unknown as GenericTool;

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should NOT create tool instances when definitionsOnly=true', async () => {
      const loadedTools: GenericTool[] = [createMCPTool('tool1')];

      const agentToolOptions: AgentToolOptions = {
        tool1: { defer_loading: true },
      };

      const result = await buildToolClassification({
        loadedTools,
        userId: 'user1',
        agentId: 'agent1',
        agentToolOptions,
        deferredToolsEnabled: true,
        definitionsOnly: true,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.additionalTools.length).toBe(0);
    });

    it('should still add tool_search definition when definitionsOnly=true and has deferred tools', async () => {
      const loadedTools: GenericTool[] = [
        createMCPTool('list_commits_mcp_github'),
      ];

      const agentToolOptions: AgentToolOptions = {
        list_commits_mcp_github: { defer_loading: true },
      };

      const result = await buildToolClassification({
        loadedTools,
        userId: 'user1',
        agentId: 'agent1',
        agentToolOptions,
        deferredToolsEnabled: true,
        definitionsOnly: true,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.toolDefinitions.some((d) => d.name === Constants.TOOL_SEARCH)).toBe(true);
      expect(result.toolRegistry?.has(Constants.TOOL_SEARCH)).toBe(true);
    });

    it('should create tool instances when definitionsOnly=false (default)', async () => {
      const loadedTools: GenericTool[] = [
        createMCPTool('list_commits_mcp_github'),
      ];

      const agentToolOptions: AgentToolOptions = {
        list_commits_mcp_github: { defer_loading: true },
      };

      const result = await buildToolClassification({
        loadedTools,
        userId: 'user1',
        agentId: 'agent1',
        agentToolOptions,
        deferredToolsEnabled: true,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(
        result.additionalTools.some((t) => t.name === Constants.TOOL_SEARCH),
      ).toBe(true);
    });

    it('should NOT add PTC (run_tools_with_code) when agent has programmatic tools - PTC removed (was CODE_API_KEY/E2B dependent)', async () => {
      const loadedTools: GenericTool[] = [createMCPTool('tool1')];

      const agentToolOptions: AgentToolOptions = {
        tool1: { allowed_callers: ['code_execution'] },
      };

      const result = await buildToolClassification({
        loadedTools,
        userId: 'user1',
        agentId: 'agent1',
        agentToolOptions,
        deferredToolsEnabled: true,
        definitionsOnly: false,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.additionalTools.some((t) => t.name === 'run_tools_with_code')).toBe(false);
      expect(result.toolDefinitions.some((d) => d.name === 'run_tools_with_code')).toBe(false);
      expect(result.toolRegistry?.has('run_tools_with_code')).toBe(false);
    });
  });
});
