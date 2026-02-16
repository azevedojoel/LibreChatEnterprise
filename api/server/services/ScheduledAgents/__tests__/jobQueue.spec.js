/**
 * Tests for jobQueue - runSerializedPerAgent serializes per agent, different agents parallel
 */
const mockExecuteScheduledAgent = jest.fn();

jest.mock('../executeAgent', () => ({
  executeScheduledAgent: (...args) => mockExecuteScheduledAgent(...args),
}));

jest.mock('@librechat/api', () => ({
  cacheConfig: {},
}), { virtual: true });

jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

const { runSerializedPerAgent } = require('../jobQueue');

describe('runSerializedPerAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteScheduledAgent.mockResolvedValue({ success: true });
  });

  it('should run executeScheduledAgent with runId and payload', async () => {
    const payload = {
      scheduleId: 'sched-1',
      userId: 'user-1',
      agentId: 'agent-1',
      prompt: 'Hi',
      conversationId: 'conv-1',
      selectedTools: ['a'],
    };

    await runSerializedPerAgent('run-1', payload);

    expect(mockExecuteScheduledAgent).toHaveBeenCalledWith({
      runId: 'run-1',
      ...payload,
    });
  });

  it('should serialize runs for the same agent - second waits for first', async () => {
    const payload1 = {
      scheduleId: 'sched-1',
      userId: 'user-1',
      agentId: 'agent-A',
      prompt: 'First',
      conversationId: 'conv-1',
      selectedTools: [],
    };
    const payload2 = {
      scheduleId: 'sched-2',
      userId: 'user-1',
      agentId: 'agent-A',
      prompt: 'Second',
      conversationId: 'conv-2',
      selectedTools: [],
    };

    let firstStarted = false;
    let secondStartedBeforeFirstFinished = false;
    mockExecuteScheduledAgent.mockImplementation(async (args) => {
      if (args.prompt === 'First') {
        firstStarted = true;
        await new Promise((r) => setTimeout(r, 50));
        if (secondStartedBeforeFirstFinished) {
          throw new Error('Second run started before first finished');
        }
        return { success: true };
      }
      if (args.prompt === 'Second') {
        secondStartedBeforeFirstFinished = firstStarted; // would be true if we ran in parallel
        return { success: true };
      }
    });

    const p1 = runSerializedPerAgent('run-1', payload1);
    const p2 = runSerializedPerAgent('run-2', payload2);

    await Promise.all([p1, p2]);

    expect(mockExecuteScheduledAgent).toHaveBeenCalledTimes(2);
    expect(mockExecuteScheduledAgent).toHaveBeenNthCalledWith(1, expect.objectContaining({ runId: 'run-1', prompt: 'First' }));
    expect(mockExecuteScheduledAgent).toHaveBeenNthCalledWith(2, expect.objectContaining({ runId: 'run-2', prompt: 'Second' }));
  });

  it('should run different agents in parallel', async () => {
    const payload1 = {
      scheduleId: 'sched-1',
      userId: 'user-1',
      agentId: 'agent-A',
      prompt: 'Agent A',
      conversationId: 'conv-1',
      selectedTools: [],
    };
    const payload2 = {
      scheduleId: 'sched-2',
      userId: 'user-1',
      agentId: 'agent-B',
      prompt: 'Agent B',
      conversationId: 'conv-2',
      selectedTools: [],
    };

    const executionOrder = [];
    mockExecuteScheduledAgent.mockImplementation(async (args) => {
      executionOrder.push(args.agentId);
      await new Promise((r) => setTimeout(r, 20));
      return { success: true };
    });

    const p1 = runSerializedPerAgent('run-1', payload1);
    const p2 = runSerializedPerAgent('run-2', payload2);

    await Promise.all([p1, p2]);

    expect(mockExecuteScheduledAgent).toHaveBeenCalledTimes(2);
    expect(executionOrder).toContain('agent-A');
    expect(executionOrder).toContain('agent-B');
  });
});
