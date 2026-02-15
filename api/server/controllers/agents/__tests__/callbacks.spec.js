const { Tools } = require('librechat-data-provider');

// Mock all dependencies before requiring the module
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'mock-id'),
}));

const mockEmitChunk = jest.fn().mockResolvedValue();

jest.mock('@librechat/api', () => ({
  sendEvent: jest.fn(),
  GenerationJobManager: {
    emitChunk: (...args) => mockEmitChunk(...args),
  },
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock('@librechat/agents', () => ({
  ...jest.requireActual('@librechat/agents'),
  getMessageId: jest.fn(),
  ToolEndHandler: jest.fn(),
  handleToolCalls: jest.fn(),
  ChatModelStreamHandler: jest.fn(),
}));

jest.mock('~/server/services/Files/Citations', () => ({
  processFileCitations: jest.fn(),
}));

jest.mock('~/server/services/Files/Code/processLocalOutput', () => ({
  processLocalCodeOutput: jest.fn(),
}));

jest.mock('~/server/services/Tools/credentials', () => ({
  loadAuthValues: jest.fn(),
}));

jest.mock('~/server/services/Files/process', () => ({
  saveBase64Image: jest.fn(),
}));

describe('createToolEndCallback', () => {
  let req, res, artifactPromises, createToolEndCallback;
  let logger;

  beforeEach(() => {
    jest.clearAllMocks();

    // Get the mocked logger
    logger = require('@librechat/data-schemas').logger;

    // Now require the module after all mocks are set up
    const callbacks = require('../callbacks');
    createToolEndCallback = callbacks.createToolEndCallback;

    req = {
      user: { id: 'user123' },
    };
    res = {
      headersSent: false,
      write: jest.fn(),
    };
    artifactPromises = [];
  });

  describe('ui_resources artifact handling', () => {
    it('should process ui_resources artifact and return attachment when headers not sent', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const output = {
        tool_call_id: 'tool123',
        artifact: {
          [Tools.ui_resources]: {
            data: [
              { type: 'button', label: 'Click me' },
              { type: 'input', placeholder: 'Enter text' },
            ],
          },
        },
      };

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output }, metadata);

      // Wait for all promises to resolve
      const results = await Promise.all(artifactPromises);

      // When headers are not sent, it returns attachment without writing
      expect(res.write).not.toHaveBeenCalled();

      const attachment = results[0];
      expect(attachment).toEqual({
        type: Tools.ui_resources,
        messageId: 'run456',
        toolCallId: 'tool123',
        conversationId: 'thread789',
        [Tools.ui_resources]: [
          { type: 'button', label: 'Click me' },
          { type: 'input', placeholder: 'Enter text' },
        ],
      });
    });

    it('should write to response when headers are already sent', async () => {
      res.headersSent = true;
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const output = {
        tool_call_id: 'tool123',
        artifact: {
          [Tools.ui_resources]: {
            data: [{ type: 'carousel', items: [] }],
          },
        },
      };

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output }, metadata);
      const results = await Promise.all(artifactPromises);

      expect(res.write).toHaveBeenCalled();
      expect(results[0]).toEqual({
        type: Tools.ui_resources,
        messageId: 'run456',
        toolCallId: 'tool123',
        conversationId: 'thread789',
        [Tools.ui_resources]: [{ type: 'carousel', items: [] }],
      });
    });

    it('should handle errors when processing ui_resources', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      // Mock res.write to throw an error
      res.headersSent = true;
      res.write.mockImplementation(() => {
        throw new Error('Write failed');
      });

      const output = {
        tool_call_id: 'tool123',
        artifact: {
          [Tools.ui_resources]: {
            data: [{ type: 'test' }],
          },
        },
      };

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output }, metadata);
      const results = await Promise.all(artifactPromises);

      expect(logger.error).toHaveBeenCalledWith(
        'Error processing artifact content:',
        expect.any(Error),
      );
      expect(results[0]).toBeNull();
    });

    it('should handle multiple artifacts including ui_resources', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const output = {
        tool_call_id: 'tool123',
        artifact: {
          [Tools.ui_resources]: {
            data: [{ type: 'chart', data: [] }],
          },
          [Tools.web_search]: {
            results: ['result1', 'result2'],
          },
        },
      };

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output }, metadata);
      const results = await Promise.all(artifactPromises);

      // Both ui_resources and web_search should be processed
      expect(artifactPromises).toHaveLength(2);
      expect(results).toHaveLength(2);

      // Check ui_resources attachment
      const uiResourceAttachment = results.find((r) => r?.type === Tools.ui_resources);
      expect(uiResourceAttachment).toBeTruthy();
      expect(uiResourceAttachment[Tools.ui_resources]).toEqual([{ type: 'chart', data: [] }]);

      // Check web_search attachment
      const webSearchAttachment = results.find((r) => r?.type === Tools.web_search);
      expect(webSearchAttachment).toBeTruthy();
      expect(webSearchAttachment[Tools.web_search]).toEqual({
        results: ['result1', 'result2'],
      });
    });

    it('should not process artifacts when output has no artifacts', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const output = {
        tool_call_id: 'tool123',
        content: 'Some regular content',
        // No artifact property
      };

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output }, metadata);

      expect(artifactPromises).toHaveLength(0);
      expect(res.write).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle empty ui_resources data object', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const output = {
        tool_call_id: 'tool123',
        artifact: {
          [Tools.ui_resources]: {
            data: [],
          },
        },
      };

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output }, metadata);
      const results = await Promise.all(artifactPromises);

      expect(results[0]).toEqual({
        type: Tools.ui_resources,
        messageId: 'run456',
        toolCallId: 'tool123',
        conversationId: 'thread789',
        [Tools.ui_resources]: [],
      });
    });

    it('should handle ui_resources with complex nested data', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const complexData = {
        0: {
          type: 'form',
          fields: [
            { name: 'field1', type: 'text', required: true },
            { name: 'field2', type: 'select', options: ['a', 'b', 'c'] },
          ],
          nested: {
            deep: {
              value: 123,
              array: [1, 2, 3],
            },
          },
        },
      };

      const output = {
        tool_call_id: 'tool123',
        artifact: {
          [Tools.ui_resources]: {
            data: complexData,
          },
        },
      };

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output }, metadata);
      const results = await Promise.all(artifactPromises);

      expect(results[0][Tools.ui_resources]).toEqual(complexData);
    });

    it('should handle when output is undefined', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output: undefined }, metadata);

      expect(artifactPromises).toHaveLength(0);
      expect(res.write).not.toHaveBeenCalled();
    });

    it('should handle when data parameter is undefined', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback(undefined, metadata);

      expect(artifactPromises).toHaveLength(0);
      expect(res.write).not.toHaveBeenCalled();
    });
  });

  describe('handoff tool handling', () => {
    it('should set handoffState.currentAgentId when lc_transfer_to_ tool completes', async () => {
      const handoffState = { currentAgentId: null };
      const toolEndCallback = createToolEndCallback({
        req,
        res,
        artifactPromises,
        handoffState,
      });

      const output = {
        name: 'lc_transfer_to_agent-456',
        tool_call_id: 'tool123',
        // No artifact - handoff runs before artifact check
      };

      await toolEndCallback({ output }, { run_id: 'run456', thread_id: 'thread789' });

      expect(handoffState.currentAgentId).toBe('agent-456');
    });

    it('should emit agent_handoff event when handoff tool completes with streamId', async () => {
      const handoffState = { currentAgentId: null };
      const toolEndCallback = createToolEndCallback({
        req,
        res,
        artifactPromises,
        streamId: 'stream-xyz',
        handoffState,
      });

      const output = {
        name: 'lc_transfer_to_schedule-manager',
        tool_call_id: 'tool123',
      };

      await toolEndCallback({ output }, { run_id: 'run456', thread_id: 'thread789' });

      expect(handoffState.currentAgentId).toBe('schedule-manager');
      expect(mockEmitChunk).toHaveBeenCalledWith('stream-xyz', {
        event: 'agent_handoff',
        data: { agent_id: 'schedule-manager' },
      });
    });

    it('should NOT emit agent_handoff when streamId is null', async () => {
      const handoffState = { currentAgentId: null };
      const toolEndCallback = createToolEndCallback({
        req,
        res,
        artifactPromises,
        streamId: null,
        handoffState,
      });

      const output = {
        name: 'lc_transfer_to_other-agent',
        tool_call_id: 'tool123',
      };

      await toolEndCallback({ output }, { run_id: 'run456', thread_id: 'thread789' });

      expect(handoffState.currentAgentId).toBe('other-agent');
      expect(mockEmitChunk).not.toHaveBeenCalled();
    });

    it('should NOT modify handoffState when handoffState is null', async () => {
      const toolEndCallback = createToolEndCallback({
        req,
        res,
        artifactPromises,
        handoffState: null,
      });

      const output = {
        name: 'lc_transfer_to_agent-789',
        tool_call_id: 'tool123',
      };

      await toolEndCallback({ output }, { run_id: 'run456', thread_id: 'thread789' });

      expect(mockEmitChunk).not.toHaveBeenCalled();
    });

    it('should NOT treat non-handoff tools as handoff', async () => {
      const handoffState = { currentAgentId: 'original' };
      const toolEndCallback = createToolEndCallback({
        req,
        res,
        artifactPromises,
        streamId: 'stream-abc',
        handoffState,
      });

      const output = {
        name: 'web_search',
        tool_call_id: 'tool123',
      };

      await toolEndCallback({ output }, { run_id: 'run456', thread_id: 'thread789' });

      expect(handoffState.currentAgentId).toBe('original');
      expect(mockEmitChunk).not.toHaveBeenCalled();
    });
  });
});

describe('getDefaultHandlers - ON_HANDOFF', () => {
  let req, res, getDefaultHandlers;
  const { GraphEvents } = require('@librechat/agents');

  beforeEach(() => {
    jest.clearAllMocks();
    const callbacks = require('../callbacks');
    getDefaultHandlers = callbacks.getDefaultHandlers;
    emitEvent = require('@librechat/api').sendEvent;

    req = { user: { id: 'user123' } };
    res = { headersSent: false, write: jest.fn() };
  });

  it('should update handoffState and emit agent_handoff when ON_HANDOFF fires with streamId', async () => {
    const handoffState = { currentAgentId: null };
    const streamId = 'stream-xyz';
    const handlers = getDefaultHandlers({
      res,
      aggregateContent: jest.fn(),
      toolEndCallback: jest.fn(),
      collectedUsage: [],
      streamId,
      handoffState,
    });

    const onHandoffEvent = GraphEvents.ON_HANDOFF ?? 'on_handoff';
    const handler = handlers[onHandoffEvent];
    expect(handler).toBeDefined();

    await handler.handle(onHandoffEvent, {
      toolName: 'lc_transfer_to_schedule-manager',
      destinationAgentId: 'schedule-manager',
    });

    expect(handoffState.currentAgentId).toBe('schedule-manager');
    expect(mockEmitChunk).toHaveBeenCalledWith(streamId, {
      event: 'agent_handoff',
      data: { agent_id: 'schedule-manager' },
    });
  });

  it('should update handoffState but NOT emit when streamId is null', async () => {
    const handoffState = { currentAgentId: null };
    const handlers = getDefaultHandlers({
      res,
      aggregateContent: jest.fn(),
      toolEndCallback: jest.fn(),
      collectedUsage: [],
      streamId: null,
      handoffState,
    });

    const onHandoffEvent = GraphEvents.ON_HANDOFF ?? 'on_handoff';
    const handler = handlers[onHandoffEvent];
    await handler.handle(onHandoffEvent, {
      toolName: 'lc_transfer_to_agent-456',
      destinationAgentId: 'agent-456',
    });

    expect(handoffState.currentAgentId).toBe('agent-456');
    expect(mockEmitChunk).not.toHaveBeenCalled();
  });
});
