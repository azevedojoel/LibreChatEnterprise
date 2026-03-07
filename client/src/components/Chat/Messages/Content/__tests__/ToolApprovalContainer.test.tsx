import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ToolApprovalContainer from '../ToolApprovalContainer';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => {
    const translations: Record<string, string> = {
      com_ui_tool_approval_required: 'Tool approval required',
      com_ui_approve: 'Approve',
      com_ui_deny: 'Deny',
      com_ui_expand: 'Expand',
      com_ui_collapse: 'Collapse',
    };
    return translations[key] || key;
  },
}));

describe('ToolApprovalContainer', () => {
  const mockOnApprove = jest.fn();
  const mockOnDeny = jest.fn();
  const mockOnToggleExpand = jest.fn();

  const defaultProps = {
    onApprove: mockOnApprove,
    onDeny: mockOnDeny,
    onToggleExpand: mockOnToggleExpand,
    isExpanded: false,
    isSubmitting: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders full-width bordered container with approval bar', () => {
    const { container } = render(<ToolApprovalContainer {...defaultProps} />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('rounded-lg', 'border', 'bg-surface-secondary');
    expect(wrapper).toHaveClass('w-full');
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Deny')).toBeInTheDocument();
  });

  it('renders children when expanded', () => {
    render(
      <ToolApprovalContainer {...defaultProps} isExpanded={true}>
        <div data-testid="expandable-content">Expandable content</div>
      </ToolApprovalContainer>,
    );

    expect(screen.getByTestId('expandable-content')).toBeInTheDocument();
    expect(screen.getByText('Expandable content')).toBeInTheDocument();
  });

  it('renders without expandable section when no children and showExpandButton false', () => {
    const { container } = render(
      <ToolApprovalContainer {...defaultProps} showExpandButton={false} />,
    );

    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(container.querySelector('[class*="border-t"]')).not.toBeInTheDocument();
  });

  it('calls onApprove when Approve button is clicked', () => {
    render(<ToolApprovalContainer {...defaultProps} />);

    fireEvent.click(screen.getByText('Approve'));

    expect(mockOnApprove).toHaveBeenCalledTimes(1);
  });
});
