import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import ToolPicker from '../ToolPicker';

const mockAgentWithTools = {
  id: 'agent-1',
  name: 'Test Agent',
  tools: ['file_search', 'tool_b'],
};

const mockRegularTools = [
  { pluginKey: 'file_search', name: 'File Search', description: 'Search files' },
  { pluginKey: 'tool_b', name: 'Tool B', description: 'Tool B desc' },
];

jest.mock('~/data-provider', () => ({
  useGetAgentByIdQuery: jest.fn(),
  useAvailableToolsQuery: jest.fn(),
  useMCPToolsQuery: jest.fn(),
}));

jest.mock('~/hooks', () => ({
  useLocalize: jest.fn().mockReturnValue((key: string) => key),
}));

const mockUseGetAgentByIdQuery = jest.requireMock('~/data-provider').useGetAgentByIdQuery;
const mockUseAvailableToolsQuery = jest.requireMock('~/data-provider').useAvailableToolsQuery;
const mockUseMCPToolsQuery = jest.requireMock('~/data-provider').useMCPToolsQuery;

describe('ToolPicker', () => {
  const onChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetAgentByIdQuery.mockReturnValue({
      data: mockAgentWithTools,
      isLoading: false,
    });
    mockUseAvailableToolsQuery.mockReturnValue({
      data: mockRegularTools,
      isLoading: false,
    });
    mockUseMCPToolsQuery.mockReturnValue({
      data: { servers: {} },
      isLoading: false,
    });
  });

  it('renders nothing when agentId is empty', () => {
    const { container } = render(
      <ToolPicker agentId="" selectedTools={null} onChange={onChange} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when agent has no tools', () => {
    mockUseGetAgentByIdQuery.mockReturnValue({
      data: { ...mockAgentWithTools, tools: [] },
      isLoading: false,
    });
    const { container } = render(
      <ToolPicker agentId="agent-1" selectedTools={null} onChange={onChange} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders Use all agent tools, No tools, Custom selection when agent has tools', () => {
    render(
      <ToolPicker agentId="agent-1" selectedTools={null} onChange={onChange} />,
    );
    expect(screen.getByText('Use all agent tools')).toBeInTheDocument();
    expect(screen.getByText('No tools')).toBeInTheDocument();
    expect(screen.getByText('Custom selection')).toBeInTheDocument();
  });

  it('calls onChange(null) when Use all is selected', () => {
    render(
      <ToolPicker agentId="agent-1" selectedTools={[]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByText('Use all agent tools'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('calls onChange([]) when No tools is selected', () => {
    render(
      <ToolPicker agentId="agent-1" selectedTools={['file_search']} onChange={onChange} />,
    );
    fireEvent.click(screen.getByText('No tools'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('in custom mode displays searchable tool list and calls onChange when tools toggled', () => {
    render(
      <ToolPicker agentId="agent-1" selectedTools={['file_search']} onChange={onChange} />,
    );
    fireEvent.click(screen.getByText('Custom selection'));
    expect(screen.getByText('File Search')).toBeInTheDocument();
    expect(screen.getByText('Tool B')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Tool B'));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
