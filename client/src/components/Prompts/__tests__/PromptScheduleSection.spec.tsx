import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PromptScheduleSection from '../PromptScheduleSection';
import { EModelEndpoint } from 'librechat-data-provider';

const mockCreateMutation = { mutate: jest.fn(), isLoading: false };
const mockRunMutation = { mutate: jest.fn(), isLoading: false };
const mockDeleteMutation = { mutate: jest.fn(), isLoading: false };
const mockUpdateMutation = { mutate: jest.fn(), isLoading: false };
const mockCancelRunMutation = { mutate: jest.fn(), isLoading: false };

jest.mock('~/components/SidePanel/ScheduledAgents/ScheduleForm', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="schedule-form" />),
}));

jest.mock('~/components/SidePanel/ScheduledAgents/ScheduledRunProgress', () => ({
  ScheduledRunProgress: jest.fn(() => null),
}));

jest.mock('~/hooks', () => ({
  useLocalize: jest.fn().mockReturnValue((key: string) => key),
  useHasAccess: jest.fn().mockReturnValue(true),
  useNavigateToConvo: jest.fn().mockReturnValue({ navigateToConvo: jest.fn() }),
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    conversationByIndex: () => ({}),
  },
}));

jest.mock('recoil', () => ({
  useRecoilValue: jest.fn().mockReturnValue(null),
  useSetRecoilState: jest.fn(),
  useRecoilState: jest.fn(),
  atom: jest.fn(),
  atomFamily: jest.fn(),
  selector: jest.fn(),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn().mockReturnValue({ invalidateQueries: jest.fn() }),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: jest.fn(),
  useGetEndpointsQuery: jest.fn(),
  useGetScheduledAgentsQuery: jest.fn().mockReturnValue({
    data: [],
    isLoading: false,
  }),
  useGetScheduledAgentRunsQuery: jest.fn().mockReturnValue({
    data: [],
    isLoading: false,
  }),
  useCreateScheduledAgentMutation: jest.fn(() => mockCreateMutation),
  useUpdateScheduledAgentMutation: jest.fn(() => mockUpdateMutation),
  useDeleteScheduledAgentMutation: jest.fn(() => mockDeleteMutation),
  useRunScheduledAgentMutation: jest.fn(() => mockRunMutation),
  useCancelScheduledRunMutation: jest.fn(() => mockCancelRunMutation),
}));

jest.mock('~/data-provider/Agents', () => ({
  useListAgentsQuery: jest.fn().mockReturnValue({
    data: { data: [{ id: 'agent-1', name: 'Agent One' }] },
  }),
}));

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useToastContext: jest.fn().mockReturnValue({ showToast: jest.fn() }),
}));

const mockUseGetStartupConfig = jest.requireMock('~/data-provider').useGetStartupConfig;
const mockUseGetEndpointsQuery = jest.requireMock('~/data-provider').useGetEndpointsQuery;
const mockUseListAgentsQuery = jest.requireMock('~/data-provider/Agents').useListAgentsQuery;

describe('PromptScheduleSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetStartupConfig.mockReturnValue({
      data: { interface: { scheduledAgents: true } },
    });
    mockUseGetEndpointsQuery.mockReturnValue({
      data: { [EModelEndpoint.agents]: {} },
    });
    mockUseListAgentsQuery.mockReturnValue({
      data: { data: [{ id: 'agent-1', name: 'Agent One' }] },
    });
  });

  it('returns null when interface.scheduledAgents === false', () => {
    mockUseGetStartupConfig.mockReturnValue({
      data: { interface: { scheduledAgents: false } },
    });

    const { container } = render(
      <PromptScheduleSection promptGroupId="pg-1" promptGroupName="Test Prompt" />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders when scheduledAgentsEnabled and promptGroupId provided', () => {
    render(
      <PromptScheduleSection promptGroupId="pg-1" promptGroupName="Test Prompt" />,
    );

    expect(screen.getByRole('region', { name: 'com_prompts_schedule_section' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_prompts_run_now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_ui_create' })).toBeInTheDocument();
  });

  it('Run Now flow: createMutation.mutate -> onSuccess runMutation.mutate -> onSuccess deleteMutation.mutate', async () => {
    render(
      <PromptScheduleSection promptGroupId="pg-1" promptGroupName="Test Prompt" />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'com_prompts_run_now' }));

    await waitFor(() => {
      expect(mockCreateMutation.mutate).toHaveBeenCalled();
    });

    const createCalls = mockCreateMutation.mutate.mock.calls;
    expect(createCalls.length).toBeGreaterThan(0);
    const [payload, opts] = createCalls[0];
    expect(payload.promptGroupId).toBe('pg-1');
    expect(opts?.onSuccess).toBeDefined();

    const mockSchedule = { _id: 'sched-1' };
    opts!.onSuccess!(mockSchedule);

    expect(mockRunMutation.mutate).toHaveBeenCalledWith('sched-1', expect.any(Object));
    const runCalls = mockRunMutation.mutate.mock.calls;
    const [, runOpts] = runCalls[runCalls.length - 1];
    runOpts!.onSuccess!({ success: true, conversationId: 'conv-1' });

    expect(mockDeleteMutation.mutate).toHaveBeenCalledWith('sched-1');
  });

  it('shows com_ui_no_agent and disables Run Now/Create when agents array is empty', () => {
    mockUseListAgentsQuery.mockReturnValue({
      data: { data: [] },
    });

    render(
      <PromptScheduleSection promptGroupId="pg-1" promptGroupName="Test Prompt" />,
    );

    expect(screen.getByText('com_ui_no_agent')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_prompts_run_now' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'com_ui_create' })).toBeDisabled();
  });

  it('disables Run Now and Create when actionsDisabled (no canUseScheduling)', () => {
    const mockUseHasAccess = jest.requireMock('~/hooks').useHasAccess;
    mockUseHasAccess.mockReturnValue(false);

    render(
      <PromptScheduleSection promptGroupId="pg-1" promptGroupName="Test Prompt" />,
    );

    expect(screen.getByRole('button', { name: 'com_prompts_run_now' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'com_ui_create' })).toBeDisabled();
  });
});
