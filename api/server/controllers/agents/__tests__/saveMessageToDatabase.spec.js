/**
 * Tests for AgentClient.saveMessageToDatabase handoff persistence.
 *
 * When a handoff occurs mid-stream, handoffState.currentAgentId is set by the
 * tool callback. The initial saveOptions captured at request start has the
 * original agent_id. This override ensures the response is persisted with
 * the handed-off agent by calling getSaveOptions() at save time.
 */

const { EModelEndpoint } = require('librechat-data-provider');

jest.mock('~/models/spendTokens', () => ({
  spendTokens: jest.fn().mockResolvedValue(),
  spendStructuredTokens: jest.fn().mockResolvedValue(),
}));

jest.mock('~/config', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
  getMCPManager: jest.fn(() => ({
    formatInstructionsForContext: jest.fn(),
  })),
}));

jest.mock('@librechat/agents', () => ({
  ...jest.requireActual('@librechat/agents'),
  createMetadataAggregator: () => ({
    handleLLMEnd: jest.fn(),
    collected: [],
  }),
}));

const BaseClient = require('~/app/clients/BaseClient');
const AgentClient = require('../client');

describe('AgentClient - saveMessageToDatabase handoff', () => {
  let client;
  let superSaveSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    superSaveSpy = jest
      .spyOn(BaseClient.prototype, 'saveMessageToDatabase')
      .mockResolvedValue({ message: {}, conversation: {} });
  });

  afterEach(() => {
    superSaveSpy?.mockRestore();
  });

  it('should merge getSaveOptions when saving response with handoffState', async () => {
    const handoffState = { currentAgentId: 'schedule-manager' };
    const mockAgent = {
      id: 'chat-agent',
      endpoint: EModelEndpoint.openAI,
      provider: EModelEndpoint.openAI,
      model_parameters: { model: 'gpt-4' },
    };

    client = new AgentClient({
      req: { user: { id: 'user-123' }, body: { endpoint: EModelEndpoint.agents } },
      res: {},
      agent: mockAgent,
      endpoint: EModelEndpoint.agents,
      handoffState,
      endpointTokenConfig: {},
    });
    client.conversationId = 'convo-123';
    client.user = 'user-123';

    const responseMessage = {
      messageId: 'resp-1',
      conversationId: 'convo-123',
      parentMessageId: 'user-1',
      isCreatedByUser: false,
      text: 'Response',
      sender: 'Assistant',
    };

    const initialEndpointOptions = {
      agent_id: 'chat-agent',
      endpoint: EModelEndpoint.agents,
    };

    await client.saveMessageToDatabase(responseMessage, initialEndpointOptions, 'user-123');

    expect(superSaveSpy).toHaveBeenCalledTimes(1);
    const [, optionsPassed] = superSaveSpy.mock.calls[0];
    // Should use handed-off agent_id from handoffState, not the initial options
    expect(optionsPassed.agent_id).toBe('schedule-manager');
    expect(optionsPassed.endpoint).toBe(EModelEndpoint.agents);
  });

  it('should NOT merge getSaveOptions when saving user message', async () => {
    const handoffState = { currentAgentId: 'schedule-manager' };
    const mockAgent = {
      id: 'chat-agent',
      endpoint: EModelEndpoint.openAI,
      provider: EModelEndpoint.openAI,
      model_parameters: { model: 'gpt-4' },
    };

    client = new AgentClient({
      req: { user: { id: 'user-123' }, body: { endpoint: EModelEndpoint.agents } },
      res: {},
      agent: mockAgent,
      endpoint: EModelEndpoint.agents,
      handoffState,
      endpointTokenConfig: {},
    });
    client.conversationId = 'convo-123';
    client.user = 'user-123';

    const userMessage = {
      messageId: 'user-1',
      conversationId: 'convo-123',
      parentMessageId: 'root',
      isCreatedByUser: true,
      text: 'Hello',
      sender: 'User',
    };

    const initialEndpointOptions = { agent_id: 'chat-agent', endpoint: EModelEndpoint.agents };

    await client.saveMessageToDatabase(userMessage, initialEndpointOptions, 'user-123');

    expect(superSaveSpy).toHaveBeenCalledTimes(1);
    const [, optionsPassed] = superSaveSpy.mock.calls[0];
    // User messages should use the passed options as-is, no handoff merge
    expect(optionsPassed.agent_id).toBe('chat-agent');
  });

  it('should use passed options as-is when handoffState is absent', async () => {
    const mockAgent = {
      id: 'chat-agent',
      endpoint: EModelEndpoint.openAI,
      provider: EModelEndpoint.openAI,
      model_parameters: { model: 'gpt-4' },
    };

    client = new AgentClient({
      req: { user: { id: 'user-123' }, body: { endpoint: EModelEndpoint.agents } },
      res: {},
      agent: mockAgent,
      endpoint: EModelEndpoint.agents,
      endpointTokenConfig: {},
    });
    client.conversationId = 'convo-123';
    client.user = 'user-123';

    const responseMessage = {
      messageId: 'resp-1',
      conversationId: 'convo-123',
      parentMessageId: 'user-1',
      isCreatedByUser: false,
      text: 'Response',
      sender: 'Assistant',
    };

    const initialEndpointOptions = { agent_id: 'chat-agent', endpoint: EModelEndpoint.agents };

    await client.saveMessageToDatabase(responseMessage, initialEndpointOptions, 'user-123');

    expect(superSaveSpy).toHaveBeenCalledTimes(1);
    const [, optionsPassed] = superSaveSpy.mock.calls[0];
    // No handoffState: options passed through unchanged
    expect(optionsPassed.agent_id).toBe('chat-agent');
  });
});
