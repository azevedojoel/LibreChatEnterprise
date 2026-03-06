import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import ToolApprovalPage from '../ToolApprovalPage';

const mockNavigate = jest.fn();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
const mockGetPendingToolConfirmation = jest.fn();
const mockSubmitToolConfirmation = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../useAuthRedirect', () => ({
  __esModule: true,
  default: () => ({ isAuthenticated: true }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: { name?: string }) => {
    const translations: Record<string, string> = {
      com_ui_loading: 'Loading...',
      com_ui_invalid_link: 'Invalid or expired approval link.',
      com_ui_expired: 'This approval link has expired.',
      com_ui_tool_approval_required: 'Tool approval required',
      com_ui_tool_approval_prompt:
        'Your agent is requesting to run a potentially destructive tool. Approve or deny to continue.',
      com_ui_tool_approval_agent_requesting: '{{name}} is requesting your approval.',
      com_ui_tool_approval_await_title: 'Approval needed',
      com_ui_tool_approval_await_prompt: 'Someone needs your approval to continue.',
      com_ui_tool_approval_await_agent: '{{name}} needs your approval to continue.',
      com_ui_tool_approval_from: 'From',
      com_ui_tool_approval_requested_by: 'Requested by',
      com_ui_tool_approval_message_label: 'What they need',
      com_ui_tool_name: 'Tool',
      com_ui_approve: 'Approve',
      com_ui_deny: 'Deny',
      com_ui_close: 'Close',
      com_ui_tool_approved: 'Approved',
      com_ui_tool_denied: 'Denied',
      com_ui_tool_approved_message: 'The tool has been approved and will continue executing.',
      com_ui_tool_denied_message: 'The tool has been denied.',
      com_ui_view_conversation: 'View conversation',
      com_ui_tool_approval_context: 'Conversation context',
    };
    const t = translations[key] || key;
    return options?.name ? t.replace('{{name}}', options.name) : t;
  },
}));

jest.mock('~/data-provider/SSE/mutations', () => ({
  getPendingToolConfirmation: (...args: unknown[]) => mockGetPendingToolConfirmation(...args),
  submitToolConfirmation: (...args: unknown[]) => mockSubmitToolConfirmation(...args),
}));

function createTestRouter(searchParams = '') {
  const path = searchParams ? `/approve/tool?${searchParams}` : '/approve/tool';
  return createMemoryRouter(
    [
      {
        path: '/approve/tool',
        element: <ToolApprovalPage />,
      },
    ],
    {
      initialEntries: [path],
    },
  );
}

describe('ToolApprovalPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPendingToolConfirmation.mockReset();
    mockSubmitToolConfirmation.mockReset();
  });

  it('shows loading state initially', async () => {
    mockGetPendingToolConfirmation.mockImplementation(
      () => new Promise(() => {}),
    );

    const router = createTestRouter('id=token-1');
    render(
      <TestWrapper>
        <RouterProvider router={router} />
      </TestWrapper>,
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows error when no id in URL', async () => {
    const router = createTestRouter('');
    render(
      <TestWrapper>
        <RouterProvider router={router} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Invalid or expired approval link.')).toBeInTheDocument();
    });
  });

  it('shows error when fetch fails', async () => {
    mockGetPendingToolConfirmation.mockRejectedValue(new Error('Network error'));

    const router = createTestRouter('id=token-1');
    render(
      <TestWrapper>
        <RouterProvider router={router} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('This approval link has expired.')).toBeInTheDocument();
    });
  });

  it('renders tool friendly name and token bubbles when pending', async () => {
    mockGetPendingToolConfirmation.mockResolvedValue({
      toolName: 'execute_code',
      argsSummary: '{"path": "/tmp/script.py", "language": "python"}',
      conversationId: 'conv-1',
    });

    const router = createTestRouter('id=token-1');
    render(
      <TestWrapper>
        <RouterProvider router={router} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Code Interpreter/)).toBeInTheDocument();
      expect(screen.getByText(/\/tmp\/script\.py/)).toBeInTheDocument();
      expect(screen.getByText(/python/)).toBeInTheDocument();
    });

    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Deny')).toBeInTheDocument();
  });

  it('shows approved state after successful approve', async () => {
    mockGetPendingToolConfirmation.mockResolvedValue({
      toolName: 'execute_code',
      argsSummary: '',
      conversationId: 'conv-1',
    });
    mockSubmitToolConfirmation.mockResolvedValue({ success: true });

    const router = createTestRouter('id=token-1');
    render(
      <TestWrapper>
        <RouterProvider router={router} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Approve')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Approve'));

    await waitFor(() => {
      expect(screen.getByText('Approved')).toBeInTheDocument();
      expect(screen.getByText('The tool has been approved and will continue executing.')).toBeInTheDocument();
    });
  });

  it('shows denied state after successful deny', async () => {
    mockGetPendingToolConfirmation.mockResolvedValue({
      toolName: 'execute_code',
      argsSummary: '',
      conversationId: 'conv-1',
    });
    mockSubmitToolConfirmation.mockResolvedValue({ success: true });

    const router = createTestRouter('id=token-1');
    render(
      <TestWrapper>
        <RouterProvider router={router} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Deny')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Deny'));

    await waitFor(() => {
      expect(screen.getByText('Denied')).toBeInTheDocument();
      expect(screen.getByText('The tool has been denied.')).toBeInTheDocument();
    });
  });

  it('shows context label and conversation context expanded by default when provided', async () => {
    mockGetPendingToolConfirmation.mockResolvedValue({
      toolName: 'execute_code',
      argsSummary: '{}',
      conversationId: 'conv-1',
      contextLabel: 'Deals agent, daily run',
      conversationTitle: 'Deals agent, daily run',
      recentMessages: [
        { role: 'user', text: 'Summarize the deals' },
        { role: 'assistant', text: 'Here is the summary...' },
      ],
    });

    const router = createTestRouter('id=token-1');
    render(
      <TestWrapper>
        <RouterProvider router={router} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Deals agent, daily run')).toBeInTheDocument();
      expect(screen.getByText('Conversation context')).toBeInTheDocument();
      expect(screen.getByText(/Summarize the deals/)).toBeInTheDocument();
      expect(screen.getByText(/Here is the summary/)).toBeInTheDocument();
    });
  });

  it('shows human-friendly approval UI with agent, requester, and message', async () => {
    mockGetPendingToolConfirmation.mockResolvedValue({
      toolName: 'human_await_response',
      argsSummary: '{"memberId":"123","message":"Please approve sending this email to the client."}',
      conversationId: 'conv-1',
      agentName: 'Ellis',
      requesterName: 'Joel',
      requestMessage: 'Please approve sending this email to the client.',
    });

    const router = createTestRouter('id=token-1');
    render(
      <TestWrapper>
        <RouterProvider router={router} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Approval needed')).toBeInTheDocument();
      expect(screen.getByText(/Ellis needs your approval to continue/)).toBeInTheDocument();
      expect(screen.getByText(/From/)).toBeInTheDocument();
      expect(screen.getByText('Ellis')).toBeInTheDocument();
      expect(screen.getByText(/Requested by/)).toBeInTheDocument();
      expect(screen.getByText('Joel')).toBeInTheDocument();
      expect(screen.getByText(/What they need/)).toBeInTheDocument();
      expect(screen.getByText('Please approve sending this email to the client.')).toBeInTheDocument();
    });
    expect(screen.queryByText(/memberId|Arguments/)).not.toBeInTheDocument();
  });

  it('hides technical JSON for human_await_response with request message', async () => {
    mockGetPendingToolConfirmation.mockResolvedValue({
      toolName: 'human_await_response',
      argsSummary: '{"memberId":"123","message":"Please approve."}',
      conversationId: 'conv-1',
      requestMessage: 'Please approve.',
    });

    const router = createTestRouter('id=token-1');
    render(
      <TestWrapper>
        <RouterProvider router={router} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Approval needed')).toBeInTheDocument();
      expect(screen.getByText('Someone needs your approval to continue.')).toBeInTheDocument();
      expect(screen.getByText('Please approve.')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Tool:|Request Approval|memberId|Arguments/)).not.toBeInTheDocument();
  });

  it('shows View conversation button when resolved with pending data', async () => {
    mockGetPendingToolConfirmation.mockResolvedValue({
      toolName: 'execute_code',
      argsSummary: '',
      conversationId: 'conv-123',
    });
    mockSubmitToolConfirmation.mockResolvedValue({ success: true });

    const router = createTestRouter('id=token-1');
    render(
      <TestWrapper>
        <RouterProvider router={router} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Approve')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Approve'));

    await waitFor(() => {
      expect(screen.getByText('View conversation')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('View conversation'));
    expect(mockNavigate).toHaveBeenCalledWith('/c/conv-123', { replace: true });
  });
});
