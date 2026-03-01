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
    pendingToolConfirmation?: Record<
      string,
      { conversationId: string; runId: string; toolCallId: string; toolName: string; argsSummary?: string }
    >;
    resolvedToolApprovals?: Record<string, 'approved' | 'denied'>;
  },
) {
  const initState =
    initialState?.pendingToolConfirmation || initialState?.resolvedToolApprovals
      ? (snap: { set: (atom: unknown, value: unknown) => void }) => {
          if (initialState?.pendingToolConfirmation) {
            snap.set(store.pendingToolConfirmationAtom, initialState.pendingToolConfirmation);
          }
          if (initialState?.resolvedToolApprovals) {
            snap.set(store.resolvedToolApprovalsAtom, initialState.resolvedToolApprovals);
          }
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

  it('returns approvalStatus null when output has content but tool never required approval', () => {
    const { result } = renderHook(() => useToolApproval('tool-1', 'hello world'), {
      wrapper: createWrapper(),
    });

    expect(result.current.approvalStatus).toBe(null);
  });

  it('returns approvalStatus approved when output exists and tool was approved via resolved store', () => {
    const { result } = renderHook(() => useToolApproval('tool-1', 'execution result'), {
      wrapper: createWrapper({
        resolvedToolApprovals: { 'conv-1:msg-1:tool-1': 'approved' },
      }),
    });

    expect(result.current.approvalStatus).toBe('approved');
  });

  it('returns approvalStatus denied when output contains User denied execution', () => {
    const { result } = renderHook(
      () => useToolApproval('tool-1', 'User denied execution.'),
      { wrapper: createWrapper() },
    );

    expect(result.current.approvalStatus).toBe('denied');
  });

  it('returns approvalStatus denied when output contains denied execution (case insensitive)', () => {
    const { result } = renderHook(
      () => useToolApproval('tool-1', 'USER DENIED EXECUTION'),
      { wrapper: createWrapper() },
    );

    expect(result.current.approvalStatus).toBe('denied');
  });

  it('returns approvalStatus null when no output and no pending', () => {
    const { result } = renderHook(() => useToolApproval('tool-1'), {
      wrapper: createWrapper(),
    });

    expect(result.current.approvalStatus).toBe(null);
  });

  it('returns approvalStatus pending when pendingMatches and no output', () => {
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

    expect(result.current.approvalStatus).toBe('pending');
  });

  it('returns approvalStatus pending when pendingMatches even with output (pending takes precedence)', () => {
    const { result } = renderHook(
      () => useToolApproval('tool-1', 'execution result'),
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
          },
        }),
      },
    );

    expect(result.current.approvalStatus).toBe('pending');
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
      runId: 'msg-1',
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
      runId: 'msg-1',
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

  it('handleApprove shows toast when result.success is false (does not optimistically mark approved)', async () => {
    mockMutateAsync.mockResolvedValue({ success: false });

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
