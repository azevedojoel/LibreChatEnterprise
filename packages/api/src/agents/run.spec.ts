import { ToolMessage, AIMessage, HumanMessage } from '@langchain/core/messages';
import { extractDiscoveredToolsFromHistory, getToolsSentToModel } from './run';

describe('extractDiscoveredToolsFromHistory', () => {
  it('extracts tool names from tool_search JSON output', () => {
    const toolSearchOutput = JSON.stringify({
      found: 3,
      tools: [
        { name: 'tool_a', score: 1.0 },
        { name: 'tool_b', score: 0.8 },
        { name: 'tool_c', score: 0.5 },
      ],
    });

    const messages = [
      new HumanMessage('Find tools'),
      new AIMessage({ content: '', tool_calls: [{ id: 'call_1', name: 'tool_search', args: {} }] }),
      new ToolMessage({ content: toolSearchOutput, tool_call_id: 'call_1', name: 'tool_search' }),
    ];

    const discovered = extractDiscoveredToolsFromHistory(messages);

    expect(discovered.size).toBe(3);
    expect(discovered.has('tool_a')).toBe(true);
    expect(discovered.has('tool_b')).toBe(true);
    expect(discovered.has('tool_c')).toBe(true);
  });

  it('extracts tool names from legacy tool_search format', () => {
    const legacyOutput = `Found 2 tools:
- tool_x (score: 0.95)
- tool_y (score: 0.80)`;

    const messages = [
      new ToolMessage({ content: legacyOutput, tool_call_id: 'call_1', name: 'tool_search' }),
    ];

    const discovered = extractDiscoveredToolsFromHistory(messages);

    expect(discovered.size).toBe(2);
    expect(discovered.has('tool_x')).toBe(true);
    expect(discovered.has('tool_y')).toBe(true);
  });

  it('returns empty set when no tool_search messages exist', () => {
    const messages = [new HumanMessage('Hello'), new AIMessage('Hi there!')];

    const discovered = extractDiscoveredToolsFromHistory(messages);

    expect(discovered.size).toBe(0);
  });

  it('ignores non-tool_search ToolMessages', () => {
    const messages = [
      new ToolMessage({
        content: '[{"sha": "abc123"}]',
        tool_call_id: 'call_1',
        name: 'list_commits_mcp_github',
      }),
    ];

    const discovered = extractDiscoveredToolsFromHistory(messages);

    expect(discovered.size).toBe(0);
  });

  it('ignores tool_search_mcp_* messages (upstream uses single tool_search only)', () => {
    const toolSearchOutput = JSON.stringify({
      found: 2,
      tools: [
        { name: 'list_commits_mcp_github', score: 1.0 },
        { name: 'search_code_mcp_github', score: 0.9 },
      ],
    });

    const messages = [
      new ToolMessage({
        content: toolSearchOutput,
        tool_call_id: 'call_1',
        name: 'tool_search_mcp_GitHub',
      }),
    ];

    const discovered = extractDiscoveredToolsFromHistory(messages);

    expect(discovered.size).toBe(0);
  });

  it('handles multiple tool_search calls in history', () => {
    const firstOutput = JSON.stringify({
      tools: [{ name: 'tool_1' }, { name: 'tool_2' }],
    });
    const secondOutput = JSON.stringify({
      tools: [{ name: 'tool_2' }, { name: 'tool_3' }],
    });

    const messages = [
      new ToolMessage({ content: firstOutput, tool_call_id: 'call_1', name: 'tool_search' }),
      new AIMessage('Using discovered tools'),
      new ToolMessage({ content: secondOutput, tool_call_id: 'call_2', name: 'tool_search' }),
    ];

    const discovered = extractDiscoveredToolsFromHistory(messages);

    expect(discovered.size).toBe(3);
    expect(discovered.has('tool_1')).toBe(true);
    expect(discovered.has('tool_2')).toBe(true);
    expect(discovered.has('tool_3')).toBe(true);
  });

  it('handles malformed JSON in tool_search output', () => {
    const messages = [
      new ToolMessage({
        content: 'This is not valid JSON',
        tool_call_id: 'call_1',
        name: 'tool_search',
      }),
    ];

    const discovered = extractDiscoveredToolsFromHistory(messages);

    // Should not throw, just return empty set
    expect(discovered.size).toBe(0);
  });

  it('handles tool_search output with empty tools array', () => {
    const output = JSON.stringify({
      found: 0,
      tools: [],
    });

    const messages = [
      new ToolMessage({ content: output, tool_call_id: 'call_1', name: 'tool_search' }),
    ];

    const discovered = extractDiscoveredToolsFromHistory(messages);

    expect(discovered.size).toBe(0);
  });

  it('handles non-string content in ToolMessage', () => {
    const messages = [
      new ToolMessage({
        content: [{ type: 'text', text: 'array content' }],
        tool_call_id: 'call_1',
        name: 'tool_search',
      }),
    ];

    const discovered = extractDiscoveredToolsFromHistory(messages);

    // Should handle gracefully
    expect(discovered.size).toBe(0);
  });
});

describe('getToolsSentToModel', () => {
  it('returns tool names from toolDefinitions for each agent', () => {
    const agents = [
      {
        id: 'agent-1',
        toolDefinitions: [{ name: 'web_search' }, { name: 'file_search' }],
        hasDeferredTools: false,
      },
    ];
    const result = getToolsSentToModel({ agents });
    expect(result.size).toBe(1);
    expect(result.get('agent-1')).toEqual(['web_search', 'file_search']);
  });

  it('merges discoveredTools when agent has hasDeferredTools', () => {
    const toolSearchOutput = JSON.stringify({
      found: 1,
      tools: [{ name: 'discovered_mcp_tool', score: 1.0 }],
    });
    const messages = [
      new AIMessage({
        content: '',
        tool_calls: [{ id: 'call_1', name: 'tool_search', args: {} }],
      }),
      new ToolMessage({
        content: toolSearchOutput,
        tool_call_id: 'call_1',
        name: 'tool_search',
      }),
    ];
    const mockRegistry = new Map();
    mockRegistry.set('discovered_mcp_tool', { name: 'discovered_mcp_tool' });
    const agents = [
      {
        id: 'agent-1',
        toolDefinitions: [{ name: 'web_search' }],
        hasDeferredTools: true,
        toolRegistry: mockRegistry,
      },
    ];
    const result = getToolsSentToModel({ agents, messages });
    expect(result.get('agent-1')).toContain('web_search');
    expect(result.get('agent-1')).toContain('discovered_mcp_tool');
    expect(result.get('agent-1').length).toBe(2);
  });

  it('returns per-agent tool sets for multi-agent', () => {
    const agents = [
      {
        id: 'agent-a',
        toolDefinitions: [{ name: 'web_search' }],
        hasDeferredTools: false,
      },
      {
        id: 'agent-b',
        toolDefinitions: [{ name: 'file_search' }, { name: 'execute_code' }],
        hasDeferredTools: false,
      },
    ];
    const result = getToolsSentToModel({ agents });
    expect(result.get('agent-a')).toEqual(['web_search']);
    expect(result.get('agent-b')).toEqual(['file_search', 'execute_code']);
  });

  it('returns empty array for agent with no toolDefinitions', () => {
    const agents = [{ id: 'agent-1', toolDefinitions: [], hasDeferredTools: false }];
    const result = getToolsSentToModel({ agents });
    expect(result.get('agent-1')).toEqual([]);
  });

  it('excludes deferred MCP tools unless discovered (mirrors AgentContext binding)', () => {
    const agents = [
      {
        id: 'agent-1',
        toolDefinitions: [
          { name: 'tool_search', allowed_callers: ['direct'] },
          { name: 'list_mail_mcp_Microsoft', defer_loading: true, allowed_callers: ['direct'] },
          { name: 'list_calendar_mcp_Microsoft', defer_loading: true, allowed_callers: ['direct'] },
        ],
        hasDeferredTools: true,
        toolRegistry: new Map([
          ['list_mail_mcp_Microsoft', { name: 'list_mail_mcp_Microsoft', defer_loading: true }],
          ['list_calendar_mcp_Microsoft', { name: 'list_calendar_mcp_Microsoft', defer_loading: true }],
        ]),
      },
    ];
    const result = getToolsSentToModel({ agents });
    expect(result.get('agent-1')).toEqual(['tool_search']);
    expect(result.get('agent-1')).not.toContain('list_mail_mcp_Microsoft');
    expect(result.get('agent-1')).not.toContain('list_calendar_mcp_Microsoft');
  });

  it('includes deferred tools when discovered in message history', () => {
    const toolSearchOutput = JSON.stringify({
      found: 1,
      tools: [{ name: 'list_mail_mcp_Microsoft', score: 1.0 }],
    });
    const messages = [
      new AIMessage({
        content: '',
        tool_calls: [{ id: 'call_1', name: 'tool_search', args: {} }],
      }),
      new ToolMessage({
        content: toolSearchOutput,
        tool_call_id: 'call_1',
        name: 'tool_search',
      }),
    ];
    const mockRegistry = new Map();
    mockRegistry.set('list_mail_mcp_Microsoft', { name: 'list_mail_mcp_Microsoft', defer_loading: true });
    const agents = [
      {
        id: 'agent-1',
        toolDefinitions: [
          { name: 'tool_search', allowed_callers: ['direct'] },
          { name: 'list_mail_mcp_Microsoft', defer_loading: true, allowed_callers: ['direct'] },
        ],
        hasDeferredTools: true,
        toolRegistry: mockRegistry,
      },
    ];
    const result = getToolsSentToModel({ agents, messages });
    expect(result.get('agent-1')).toContain('tool_search');
    expect(result.get('agent-1')).toContain('list_mail_mcp_Microsoft');
  });
});
