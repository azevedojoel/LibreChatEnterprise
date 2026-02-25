/**
 * Tests for createToolExecuteHandler - tool execution with destructive tool confirmation
 */
import { Constants } from '@librechat/agents';
import { createToolExecuteHandler } from '../handlers';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('~/tools/classification', () => ({
  isToolSearchTool: () => false,
}));

describe('createToolExecuteHandler - destructive tool confirmation', () => {
  const mockTool = {
    name: 'execute_code',
    invoke: jest.fn().mockResolvedValue({ content: 'result', artifact: undefined }),
  };

  const mockLoadTools = jest.fn().mockResolvedValue({
    loadedTools: [mockTool],
    configurable: {},
  });

  const createHandler = (overrides?: {
    isDestructiveTool?: (name: string) => boolean;
    requestToolConfirmation?: (
      toolCall: { id: string; name: string; args: unknown },
      metadata: Record<string, unknown>,
    ) => Promise<{ approved: boolean }>;
  }) => {
    return createToolExecuteHandler({
      loadTools: mockLoadTools,
      ...overrides,
    });
  };

  const createToolExecuteBatchRequest = (toolCalls: Array<{ id: string; name: string; args?: unknown }>) => ({
    toolCalls: toolCalls.map((tc) => ({
      id: tc.id,
      name: tc.name,
      args: tc.args ?? {},
      stepId: 'step-1',
      turn: 0,
    })),
    agentId: 'agent-1',
    configurable: {},
    metadata: { run_id: 'run-1', thread_id: 'conv-1', user_id: 'user-1' },
    resolve: jest.fn(),
    reject: jest.fn(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockTool.invoke.mockResolvedValue({ content: 'result', artifact: undefined });
  });

  it('returns error when isDestructiveTool and requestToolConfirmation returns approved: false', async () => {
    const handler = createHandler({
      isDestructiveTool: (name) => name === Constants.EXECUTE_CODE,
      requestToolConfirmation: async () => ({ approved: false }),
    });

    const data = createToolExecuteBatchRequest([
      { id: 'tool-1', name: Constants.EXECUTE_CODE, args: { code: 'print(1)' } },
    ]);

    await handler.handle!('ON_TOOL_EXECUTE', data);

    expect(data.resolve).toHaveBeenCalledWith([
      {
        toolCallId: 'tool-1',
        status: 'error',
        content: '',
        errorMessage: 'User denied execution.',
      },
    ]);
    expect(mockTool.invoke).not.toHaveBeenCalled();
  });

  it('executes tool when isDestructiveTool and requestToolConfirmation returns approved: true', async () => {
    const handler = createHandler({
      isDestructiveTool: (name) => name === Constants.EXECUTE_CODE,
      requestToolConfirmation: async () => ({ approved: true }),
    });

    const data = createToolExecuteBatchRequest([
      { id: 'tool-1', name: Constants.EXECUTE_CODE, args: { code: 'print(1)' } },
    ]);

    await handler.handle!('ON_TOOL_EXECUTE', data);

    expect(data.resolve).toHaveBeenCalledWith([
      {
        toolCallId: 'tool-1',
        content: 'result',
        artifact: undefined,
        status: 'success',
      },
    ]);
    expect(mockTool.invoke).toHaveBeenCalled();
  });

  it('executes tool when isDestructiveTool and requestToolConfirmation are not provided', async () => {
    const handler = createHandler({});

    const data = createToolExecuteBatchRequest([
      { id: 'tool-1', name: Constants.EXECUTE_CODE, args: { code: 'print(1)' } },
    ]);

    await handler.handle!('ON_TOOL_EXECUTE', data);

    expect(data.resolve).toHaveBeenCalledWith([
      {
        toolCallId: 'tool-1',
        content: 'result',
        artifact: undefined,
        status: 'success',
      },
    ]);
    expect(mockTool.invoke).toHaveBeenCalled();
  });

  it('executes tool when isDestructiveTool returns false', async () => {
    const requestToolConfirmation = jest.fn();

    const handler = createHandler({
      isDestructiveTool: () => false,
      requestToolConfirmation,
    });

    const data = createToolExecuteBatchRequest([
      { id: 'tool-1', name: Constants.EXECUTE_CODE, args: {} },
    ]);

    await handler.handle!('ON_TOOL_EXECUTE', data);

    expect(data.resolve).toHaveBeenCalledWith([
      expect.objectContaining({ status: 'success' }),
    ]);
    expect(requestToolConfirmation).not.toHaveBeenCalled();
    expect(mockTool.invoke).toHaveBeenCalled();
  });
});
