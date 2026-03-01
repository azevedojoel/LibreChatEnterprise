/**
 * Tests for ToolConfirmationStore - Redis-backed store for pending tool confirmations.
 * Tests both memory fallback (Redis disabled) and Redis flow via mocks.
 */

const mockLogger = {
  warn: jest.fn(),
  error: jest.fn(),
};

const mockIoredisClient = {
  set: jest.fn(),
  get: jest.fn(),
  publish: jest.fn(),
  duplicate: jest.fn(),
};

const mockCacheConfig = { USE_REDIS: false };

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: mockLogger,
}));

jest.mock('@librechat/api', () => {
  const api = {};
  Object.defineProperty(api, 'ioredisClient', {
    get: () => (mockCacheConfig.USE_REDIS ? mockIoredisClient : null),
    configurable: true,
  });
  Object.defineProperty(api, 'cacheConfig', {
    get: () => mockCacheConfig,
    configurable: true,
  });
  return api;
});

function loadStore(useRedis = false) {
  jest.resetModules();
  mockCacheConfig.USE_REDIS = useRedis;
  return require('../ToolConfirmationStore');
}

describe('ToolConfirmationStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheConfig.USE_REDIS = false;
  });

  describe('Memory fallback (Redis disabled)', () => {
    it('register stores entry and returns promise', async () => {
      const store = loadStore();
      const params = {
        conversationId: 'conv-1',
        runId: 'run-1',
        toolCallId: 'tool-1',
        userId: 'user-1',
        toolName: 'execute_code',
        argsSummary: 'print(1)',
      };

      const { promise } = await store.register(params);

      const resolved = await Promise.race([
        promise.then((r) => ({ type: 'resolved', value: r })),
        new Promise((r) => setTimeout(() => r({ type: 'timeout' }), 50)),
      ]);

      expect(resolved.type).toBe('timeout'); // Promise not yet resolved
    });

    it('submit with correct userId resolves promise and returns success', async () => {
      const store = loadStore();
      const params = {
        conversationId: 'conv-2',
        runId: 'run-2',
        toolCallId: 'tool-2',
        userId: 'user-2',
        toolName: 'gmail_send',
        argsSummary: '',
      };

      const { promise } = await store.register(params);

      const submitPromise = store.submit({
        conversationId: params.conversationId,
        runId: params.runId,
        toolCallId: params.toolCallId,
        approved: true,
        userId: params.userId,
      });

      const [result, resolved] = await Promise.all([submitPromise, promise]);

      expect(result).toEqual({
        success: true,
        payload: { toolName: 'gmail_send', argsSummary: '' },
      });
      expect(resolved).toEqual({ approved: true });
    });

    it('submit with wrong userId returns unauthorized', async () => {
      const store = loadStore();
      const params = {
        conversationId: 'conv-3',
        runId: 'run-3',
        toolCallId: 'tool-3',
        userId: 'user-3',
        toolName: 'execute_code',
        argsSummary: '',
      };

      await store.register(params);

      const result = await store.submit({
        conversationId: params.conversationId,
        runId: params.runId,
        toolCallId: params.toolCallId,
        approved: true,
        userId: 'wrong-user',
      });

      expect(result).toEqual({ success: false, error: 'unauthorized' });
    });

    it('submit for non-existent key returns expired', async () => {
      const store = loadStore();

      const result = await store.submit({
        conversationId: 'conv-nonexistent',
        runId: 'run-x',
        toolCallId: 'tool-x',
        approved: true,
        userId: 'user-1',
      });

      expect(result).toEqual({ success: false, error: 'expired' });
    });

    it('submit with approved: false resolves with approved false', async () => {
      const store = loadStore();
      const params = {
        conversationId: 'conv-deny',
        runId: 'run-deny',
        toolCallId: 'tool-deny',
        userId: 'user-deny',
        toolName: 'execute_code',
        argsSummary: '',
      };

      const { promise } = await store.register(params);

      const result = await store.submit({
        ...params,
        approved: false,
      });

      const resolved = await promise;
      expect(result).toEqual({
        success: true,
        payload: { toolName: 'execute_code', argsSummary: '' },
      });
      expect(resolved).toEqual({ approved: false });
    });

    it('getPending returns payload when entry exists', async () => {
      const store = loadStore();
      const params = {
        conversationId: 'conv-pending',
        runId: 'run-pending',
        toolCallId: 'tool-pending',
        userId: 'user-pending',
        toolName: 'calendar_createEvent',
        argsSummary: 'meeting at 3pm',
      };

      await store.register(params);
      const pending = await store.getPending(
        params.conversationId,
        params.runId,
        params.toolCallId,
      );

      expect(pending).toEqual({
        userId: params.userId,
        toolName: params.toolName,
        argsSummary: params.argsSummary,
      });
    });

    it('getPending returns null when no entry', async () => {
      const store = loadStore();

      const pending = await store.getPending('conv-x', 'run-x', 'tool-x');

      expect(pending).toBeNull();
    });
  });

  describe('Redis flow', () => {
    let mockSubscriber;
    let messageHandler;

    beforeEach(() => {
      mockCacheConfig.USE_REDIS = true;
      messageHandler = null;
      mockSubscriber = {
        on: jest.fn((event, handler) => {
          if (event === 'message') messageHandler = handler;
        }),
        subscribe: jest.fn().mockResolvedValue(undefined),
        unsubscribe: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn(),
      };
      mockIoredisClient.set.mockResolvedValue('OK');
      mockIoredisClient.get.mockResolvedValue(null);
      mockIoredisClient.publish.mockImplementation((channel, message) => {
        if (messageHandler) {
          setImmediate(() => messageHandler(channel, message));
        }
        return Promise.resolve(1);
      });
      mockIoredisClient.duplicate.mockReturnValue(mockSubscriber);
    });

    it('register + publish resolves promise with approved', async () => {
      const store = loadStore(true);

      const params = {
        conversationId: 'conv-redis',
        runId: 'run-redis',
        toolCallId: 'tool-redis',
        userId: 'user-redis',
        toolName: 'execute_code',
        argsSummary: '',
      };

      const { promise } = await store.register(params);

      expect(mockIoredisClient.set).toHaveBeenCalled();
      expect(mockSubscriber.subscribe).toHaveBeenCalled();

      const compositeKey = `tool_confirmation:{${params.conversationId}}:${params.runId}:${params.toolCallId}`;
      mockIoredisClient.get.mockResolvedValue(
        JSON.stringify({
          userId: params.userId,
          toolName: params.toolName,
          argsSummary: params.argsSummary,
          status: 'pending',
        }),
      );

      const submitPromise = store.submit({
        ...params,
        approved: true,
      });

      const [result, resolved] = await Promise.all([submitPromise, promise]);

      expect(result).toEqual({
        success: true,
        payload: { toolName: 'execute_code', argsSummary: '' },
      });
      expect(resolved).toEqual({ approved: true });
    });

    it('submit for expired key returns expired', async () => {
      const store = loadStore(true);

      mockIoredisClient.get.mockResolvedValue(null);

      const result = await store.submit({
        conversationId: 'conv-expired',
        runId: 'run-expired',
        toolCallId: 'tool-expired',
        approved: true,
        userId: 'user-1',
      });

      expect(result).toEqual({ success: false, error: 'expired' });
    });

    it('submit with wrong userId returns unauthorized', async () => {
      const store = loadStore(true);

      mockIoredisClient.get.mockResolvedValue(
        JSON.stringify({
          userId: 'owner-user',
          toolName: 'execute_code',
          argsSummary: '',
          status: 'pending',
        }),
      );

      const result = await store.submit({
        conversationId: 'conv-auth',
        runId: 'run-auth',
        toolCallId: 'tool-auth',
        approved: true,
        userId: 'wrong-user',
      });

      expect(result).toEqual({ success: false, error: 'unauthorized' });
    });

    it('getPending returns payload when Redis has pending entry', async () => {
      const store = loadStore(true);

      const payload = {
        userId: 'user-get',
        toolName: 'gmail_send',
        argsSummary: 'test',
        status: 'pending',
      };
      mockIoredisClient.get.mockResolvedValue(JSON.stringify(payload));

      const pending = await store.getPending('conv-get', 'run-get', 'tool-get');

      expect(pending).toEqual({
        userId: payload.userId,
        toolName: payload.toolName,
        argsSummary: payload.argsSummary,
      });
    });

    it('getPending returns null when Redis has no entry', async () => {
      const store = loadStore(true);

      mockIoredisClient.get.mockResolvedValue(null);

      const pending = await store.getPending('conv-null', 'run-null', 'tool-null');

      expect(pending).toBeNull();
    });
  });
});
