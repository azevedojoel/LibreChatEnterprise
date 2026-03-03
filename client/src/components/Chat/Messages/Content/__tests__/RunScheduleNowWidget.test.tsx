import React from 'react';
import { atom } from 'recoil';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecoilRoot } from 'recoil';
import { RunScheduleNowWidget } from '../RunScheduleNowWidget';

const mockUseGetScheduledAgentRunQuery = jest.fn();
const mockUseCancelScheduledRunMutation = jest.fn();
const mockUseLocalize = jest.fn();
const mockNavigateToConvo = jest.fn();
const mockShowToast = jest.fn();

jest.mock('~/data-provider/ScheduledAgents', () => ({
  useGetScheduledAgentRunQuery: (...args: unknown[]) => mockUseGetScheduledAgentRunQuery(...args),
  useCancelScheduledRunMutation: () => mockUseCancelScheduledRunMutation(),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => mockUseLocalize(key) ?? key,
  useNavigateToConvo: () => ({ navigateToConvo: mockNavigateToConvo }),
}));

jest.mock('@librechat/client', () => ({
  Button: ({ children, onClick, ...props }: React.PropsWithChildren<{ onClick?: () => void }>) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('~/store', () => {
  const { atom } = require('recoil');
  const mockConversationAtom = atom<{ conversationId?: string } | null>({
    key: 'test-conversation-by-index',
    default: { conversationId: 'conv-0' },
  });
  return {
    default: {
      conversationByIndex: () => mockConversationAtom,
    },
    __esModule: true,
  };
});

jest.mock('~/components/SidePanel/ScheduledAgents/ScheduledRunProgress', () => ({
  ScheduledRunProgress: () => <div data-testid="scheduled-run-progress">Progress</div>,
}));

const defaultQuery = {
  data: undefined,
  isLoading: false,
  isError: false,
  error: null,
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>{children}</RecoilRoot>
    </QueryClientProvider>
  );
};

describe('RunScheduleNowWidget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalize.mockImplementation((key: string) => key);
    mockUseCancelScheduledRunMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: false,
      variables: null,
    });
  });

  it('renders queued status when loading and no run data', () => {
    mockUseGetScheduledAgentRunQuery.mockReturnValue({
      ...defaultQuery,
      data: undefined,
      isLoading: true,
    });

    render(
      <RunScheduleNowWidget runId="run-1" conversationId="conv-1" initialStatus="queued" />,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText('com_scheduler_run_queued')).toBeInTheDocument();
  });

  it('renders schedule name when run data is loaded', () => {
    mockUseGetScheduledAgentRunQuery.mockReturnValue({
      ...defaultQuery,
      data: {
        status: 'queued',
        scheduleId: { name: 'Daily Summary', agentId: 'agent-1' },
        runAt: '2025-03-03T12:00:00Z',
      },
    });

    render(
      <RunScheduleNowWidget runId="run-1" conversationId="conv-1" initialStatus="queued" />,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText('Daily Summary')).toBeInTheDocument();
  });

  it('renders error state when query fails', () => {
    mockUseGetScheduledAgentRunQuery.mockReturnValue({
      ...defaultQuery,
      isError: true,
      error: new Error('Run not found'),
    });

    render(
      <RunScheduleNowWidget runId="run-1" conversationId="conv-1" initialStatus="queued" />,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText('Run not found')).toBeInTheDocument();
  });

  it('renders status badge with correct status', () => {
    mockUseGetScheduledAgentRunQuery.mockReturnValue({
      ...defaultQuery,
      data: {
        status: 'running',
        scheduleId: { name: 'Test Schedule', agentId: 'agent-1' },
      },
    });

    render(
      <RunScheduleNowWidget runId="run-1" conversationId="conv-1" initialStatus="queued" />,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText('running')).toBeInTheDocument();
  });

  it('renders ScheduledRunProgress when status is running', () => {
    mockUseGetScheduledAgentRunQuery.mockReturnValue({
      ...defaultQuery,
      data: {
        status: 'running',
        scheduleId: { name: 'Test Schedule', agentId: 'agent-1' },
      },
    });

    render(
      <RunScheduleNowWidget runId="run-1" conversationId="conv-1" initialStatus="queued" />,
      { wrapper: createWrapper() },
    );

    expect(screen.getByTestId('scheduled-run-progress')).toBeInTheDocument();
  });
});
