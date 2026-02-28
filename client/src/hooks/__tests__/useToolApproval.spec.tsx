import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { useToolApproval } from '../useToolApproval';
import store from '~/store';

const mockMutateAsync = jest.fn();
const mockUseMessageContext = jest.fn();
const mockShowToast = jest.fn();

jest.mock('~/Providers', () => ({
  useMessageContext: () => mockUseMessageContext(),
}));

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('../useLocalize', () => () => (key: string) => key);

jest.mock('~/data-provider/SSE/mutations', () => ({
  useSubmitToolConfirmationMutation: () => ({
    mutateAsync: mockMutateAsync,
  }),
}));

function createWrapper(
  initialState?: {
    pendingToolConfirmation: Record<
      string,
      { conversationId: string; runId: string; toolCallId: string; toolName: string; argsSummary?: string }
    >;
  },
) {
  const initState = initialState?.pendingToolConfirmation
    ? (snap: { set: (atom: unknown, value: unknown) => void }) => {
        snap.set(store.pendingToolConfirmationAtom, initialState!.pendingToolConfirmation);
      }
    : undefined;

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <RecoilRoot initializeState={initState}>{children}</RecoilRoot>;
  };
}

describe('useToolApproval', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMessageContext.mockReturnValue({
      conversationId: 'conv-1',
      messageId: 'msg-1',
      partIndex: 0,
    });
  });

  it('returns pendingMatches false when no pending confirmation', () => {
    const { result } = renderHook(() => useToolApproval('tool-1'), {
      wrapper: createWrapper(),
    });

    expect(result.current.pendingMatches).toBe(false);
  });

  it('returns pendingMatches false when IDs do not match', () => {
    const { result } = renderHook(() => useToolApproval('tool-1'), {
      wrapper: createWrapper({
        pendingToolConfirmation: {
          'tool-other': {
            conversationId: 'conv-other',
            runId: 'msg-other',
            toolCallId: 'tool-other',
            toolName: 'execute_code',
            argsSummary: '',
          },
        },
      }),
    });

    expect(result.current.pendingMatches).toBe(false);
  });

  it('returns pendingMatches true when all IDs match', () => {
    const { result } = renderHook(() => useToolApproval('tool-1'), {
      wrapper: createWrapper({
        pendingToolConfirmation: {
          'tool-1': {
            conversationId: 'conv-1',
            runId: 'msg-1',
            toolCallId: 'tool-1',
            toolName: 'execute_code',
            argsSummary: '',
          },
        },
      }),
    });

    expect(result.current.pendingMatches).toBe(true);
  });

  it('returns pendingMatches false when toolCallId is undefined', () => {
    const { result } = renderHook(() => useToolApproval(undefined), {
      wrapper: createWrapper({
        pendingToolConfirmation: {
          'tool-1': {
            conversationId: 'conv-1',
            runId: 'msg-1',
            toolCallId: 'tool-1',
            toolName: 'execute_code',
            argsSummary: '',
          },
        },
      }),
    });

    expect(result.current.pendingMatches).toBe(false);
  });

  it('handleApprove calls mutateAsync with correct params and clears on success', async () => {
    mockMutateAsync.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useToolApproval('tool-1'), {
      wrapper: createWrapper({
        pendingToolConfirmation: {
          'tool-1': {
            conversationId: 'conv-1',
            runId: 'msg-1',
            toolCallId: 'tool-1',
            toolName: 'execute_code',
            argsSummary: '',
          },
        },
      }),
    });

    await act(async () => {
      await result.current.handleApprove();
    });

    expect(mockMutateAsync).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      messageId: 'msg-1',
      toolCallId: 'tool-1',
      approved: true,
    });
  });

  it('handleDeny calls mutateAsync with approved false', async () => {
    mockMutateAsync.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useToolApproval('tool-1'), {
      wrapper: createWrapper({
        pendingToolConfirmation: {
          'tool-1': {
            conversationId: 'conv-1',
            runId: 'msg-1',
            toolCallId: 'tool-1',
            toolName: 'execute_code',
            argsSummary: '',
          },
        },
      }),
    });

    await act(async () => {
      await result.current.handleDeny();
    });

    expect(mockMutateAsync).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      messageId: 'msg-1',
      toolCallId: 'tool-1',
      approved: false,
    });
  });

  it('handleApprove does nothing when context is missing', async () => {
    mockUseMessageContext.mockReturnValue({
      conversationId: null,
      messageId: null,
      partIndex: 0,
    });

    const { result } = renderHook(() => useToolApproval('tool-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.handleApprove();
    });

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('handleApprove does nothing when toolCallId is undefined', async () => {
    const { result } = renderHook(() => useToolApproval(undefined), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.handleApprove();
    });

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('handleApprove shows toast on mutation error', async () => {
    mockMutateAsync.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useToolApproval('tool-1'), {
      wrapper: createWrapper({
        pendingToolConfirmation: {
          'tool-1': {
            conversationId: 'conv-1',
            runId: 'msg-1',
            toolCallId: 'tool-1',
            toolName: 'execute_code',
            argsSummary: '',
          },
        },
      }),
    });

    await act(async () => {
      await result.current.handleApprove();
    });

    expect(mockShowToast).toHaveBeenCalledWith({
      message: 'com_ui_tool_approval_submit_error',
      status: 'error',
    });
  });

  it('parallel: both tools show pendingMatches, approving one removes only that one', async () => {
    mockMutateAsync.mockResolvedValue({ success: true });

    const { result } = renderHook(
      () => ({
        tool1: useToolApproval('tool-1'),
        tool2: useToolApproval('tool-2'),
      }),
      {
        wrapper: createWrapper({
          pendingToolConfirmation: {
            'tool-1': {
              conversationId: 'conv-1',
              runId: 'msg-1',
              toolCallId: 'tool-1',
              toolName: 'execute_code',
              argsSummary: '',
            },
            'tool-2': {
              conversationId: 'conv-1',
              runId: 'msg-1',
              toolCallId: 'tool-2',
              toolName: 'execute_code',
              argsSummary: '',
            },
          },
        }),
      },
    );

    expect(result.current.tool1.pendingMatches).toBe(true);
    expect(result.current.tool2.pendingMatches).toBe(true);

    await act(async () => {
      await result.current.tool1.handleApprove();
    });

    expect(result.current.tool1.pendingMatches).toBe(false);
    expect(result.current.tool2.pendingMatches).toBe(true);
  });
});
