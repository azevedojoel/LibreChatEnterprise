import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ToolApprovalBar from '../ToolApprovalBar';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => {
    const translations: Record<string, string> = {
      com_ui_tool_approval_required: 'Tool approval required',
      com_ui_approve: 'Approve',
      com_ui_deny: 'Deny',
      com_ui_expand: 'Expand',
      com_ui_collapse: 'Collapse',
      com_ui_tool_approved: 'Approved',
      com_ui_tool_denied: 'Denied',
      com_ui_tool_denial_reason_label: 'Reason for denial (optional)',
      com_ui_tool_denial_reason_placeholder: 'Explain why...',
      com_ui_confirm_denial: 'Confirm denial',
      com_ui_cancel: 'Cancel',
    };
    return translations[key] || key;
  },
}));

describe('ToolApprovalBar', () => {
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

  it('renders Approve and Deny buttons', () => {
    render(<ToolApprovalBar {...defaultProps} />);

    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Deny')).toBeInTheDocument();
  });

  it('renders approval required message when toolName is not provided', () => {
    render(<ToolApprovalBar {...defaultProps} />);

    expect(screen.getByText('Tool approval required')).toBeInTheDocument();
  });

  it('renders human-readable tool name when toolName is provided', () => {
    render(<ToolApprovalBar {...defaultProps} toolName="execute_code" />);

    expect(screen.getByText('Code Interpreter')).toBeInTheDocument();
  });

  it('calls onApprove when Approve button is clicked', () => {
    render(<ToolApprovalBar {...defaultProps} />);

    fireEvent.click(screen.getByText('Approve'));

    expect(mockOnApprove).toHaveBeenCalledTimes(1);
  });

  it('opens deny dialog when Deny button is clicked', () => {
    render(<ToolApprovalBar {...defaultProps} />);

    fireEvent.click(screen.getByText('Deny'));

    expect(screen.getByText('Reason for denial (optional)')).toBeInTheDocument();
    expect(screen.getByText('Confirm denial')).toBeInTheDocument();
  });

  it('calls onDeny with reason when Confirm denial is clicked after entering reason', () => {
    render(<ToolApprovalBar {...defaultProps} />);

    fireEvent.click(screen.getByText('Deny'));
    const textarea = screen.getByPlaceholderText('Explain why...');
    fireEvent.change(textarea, { target: { value: 'Not safe' } });
    fireEvent.click(screen.getByText('Confirm denial'));

    expect(mockOnDeny).toHaveBeenCalledTimes(1);
    expect(mockOnDeny).toHaveBeenCalledWith('Not safe');
  });

  it('calls onDeny with undefined when Confirm denial is clicked without reason', () => {
    render(<ToolApprovalBar {...defaultProps} />);

    fireEvent.click(screen.getByText('Deny'));
    fireEvent.click(screen.getByText('Confirm denial'));

    expect(mockOnDeny).toHaveBeenCalledTimes(1);
    expect(mockOnDeny).toHaveBeenCalledWith(undefined);
  });

  it('calls onToggleExpand when expand/collapse button is clicked', () => {
    render(<ToolApprovalBar {...defaultProps} />);

    fireEvent.click(screen.getByText('Expand'));

    expect(mockOnToggleExpand).toHaveBeenCalledTimes(1);
  });

  it('shows Collapse when isExpanded is true', () => {
    render(<ToolApprovalBar {...defaultProps} isExpanded={true} />);

    expect(screen.getByText('Collapse')).toBeInTheDocument();
  });

  it('disables Approve and Deny buttons when isSubmitting', () => {
    render(<ToolApprovalBar {...defaultProps} isSubmitting={true} />);

    expect(screen.getByText('Approve')).toBeDisabled();
    expect(screen.getByText('Deny')).toBeDisabled();
  });

  it('shows Approved status and hides Approve/Deny buttons when resolved', () => {
    render(<ToolApprovalBar {...defaultProps} resolved="approved" />);

    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.queryByText('Approve')).not.toBeInTheDocument();
    expect(screen.queryByText('Deny')).not.toBeInTheDocument();
  });

  it('shows Denied status and hides Approve/Deny buttons when resolved', () => {
    render(<ToolApprovalBar {...defaultProps} resolved="denied" />);

    expect(screen.getByText('Denied')).toBeInTheDocument();
    expect(screen.queryByText('Approve')).not.toBeInTheDocument();
    expect(screen.queryByText('Deny')).not.toBeInTheDocument();
  });

  it('shows Expand when resolved and not expanded', () => {
    render(<ToolApprovalBar {...defaultProps} resolved="approved" isExpanded={false} />);

    expect(screen.getByText('Expand')).toBeInTheDocument();
  });
});
