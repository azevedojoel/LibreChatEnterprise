import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ScheduleForm from '../ScheduleForm';
import type { ScheduleFormValues } from '../ScheduleForm';

jest.mock('../ToolPicker', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="tool-picker" />),
}));

jest.mock('../SimpleRecurrencePicker', () => ({
  __esModule: true,
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <div data-testid="cron-picker">
      <input
        data-testid="cron-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}));

jest.mock('~/hooks', () => ({
  useLocalize: jest.fn().mockReturnValue((key: string) => key),
}));

const mockAgents = [
  { id: 'agent-1', name: 'Agent One' },
  { id: 'agent-2', name: 'Agent Two' },
];

describe('ScheduleForm', () => {
  const onClose = jest.fn();
  const onSubmit = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('pre-populates form with schedule.selectedTools when editing', () => {
    const schedule = {
      _id: 'sched-1',
      name: 'My Schedule',
      agentId: 'agent-1',
      prompt: 'Hello',
      scheduleType: 'recurring' as const,
      cronExpression: '0 0 * * *',
      runAt: null,
      timezone: 'UTC',
      selectedTools: ['tool_a', 'tool_b'],
    };

    render(
      <ScheduleForm
        agents={mockAgents}
        schedule={schedule}
        onClose={onClose}
        onSubmit={onSubmit}
        isSubmitting={false}
      />,
    );

    expect(screen.getByDisplayValue('My Schedule')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Hello')).toBeInTheDocument();
    expect(screen.getByTestId('tool-picker')).toBeInTheDocument();
  });

  it('includes selectedTools in payload when submitting', async () => {
    const schedule = {
      _id: 'sched-1',
      name: 'My Schedule',
      agentId: 'agent-1',
      prompt: 'Hello',
      scheduleType: 'recurring' as const,
      cronExpression: '0 0 * * *',
      runAt: null,
      timezone: 'UTC',
      selectedTools: null,
    };

    render(
      <ScheduleForm
        agents={mockAgents}
        schedule={schedule}
        onClose={onClose}
        onSubmit={onSubmit}
        isSubmitting={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('My Schedule')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_save' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    const submittedData = onSubmit.mock.calls[0][0] as ScheduleFormValues;
    expect(submittedData).toHaveProperty('selectedTools');
    expect(submittedData.selectedTools).toBeNull();
  });

  it('renders ToolPicker when agentId is set', () => {
    render(
      <ScheduleForm
        agents={mockAgents}
        schedule={null}
        onClose={onClose}
        onSubmit={onSubmit}
        isSubmitting={false}
      />,
    );

    expect(screen.queryByTestId('tool-picker')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/com_ui_agent/i), {
      target: { value: 'agent-1' },
    });

    expect(screen.getByTestId('tool-picker')).toBeInTheDocument();
  });
});
