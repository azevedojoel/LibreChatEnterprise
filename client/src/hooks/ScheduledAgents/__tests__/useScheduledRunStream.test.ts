import { renderHook } from '@testing-library/react';

const mockAgentStream = jest.fn((id: string) => `https://test.api/stream/${encodeURIComponent(id)}`);

jest.mock('librechat-data-provider', () => ({
  agentStream: (streamId: string) => mockAgentStream(streamId),
}));

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => ({ token: 'test-token' }),
}));

jest.mock('sse.js', () => {
  const MockSSE = jest.fn().mockImplementation(function (
    this: Record<string, unknown>,
    _url: string,
    _options: object,
  ) {
    this.addEventListener = jest.fn();
    this.stream = jest.fn();
    this.close = jest.fn();
  });
  return { SSE: MockSSE };
});

import { SSE } from 'sse.js';
import { useScheduledRunStream } from '../useScheduledRunStream';

describe('useScheduledRunStream', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses agentStream to build the SSE URL when run is active', () => {
    renderHook(() =>
      useScheduledRunStream('run-123', 'conv-abc', 'running'),
    );

    expect(mockAgentStream).toHaveBeenCalledWith('conv-abc');
    expect(SSE).toHaveBeenCalledWith(
      'https://test.api/stream/conv-abc',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
        method: 'GET',
      }),
    );
  });

  it('does not connect when status is not running', () => {
    renderHook(() =>
      useScheduledRunStream('run-123', 'conv-abc', 'queued'),
    );

    expect(mockAgentStream).not.toHaveBeenCalled();
    expect(SSE).not.toHaveBeenCalled();
  });

  it('does not connect when streamId is null', () => {
    renderHook(() =>
      useScheduledRunStream('run-123', null, 'running'),
    );

    expect(mockAgentStream).not.toHaveBeenCalled();
    expect(SSE).not.toHaveBeenCalled();
  });
});
