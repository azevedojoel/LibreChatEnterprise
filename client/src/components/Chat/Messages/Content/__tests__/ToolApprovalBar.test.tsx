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

  it('calls onDeny when Deny button is clicked', () => {
    render(<ToolApprovalBar {...defaultProps} />);

    fireEvent.click(screen.getByText('Deny'));

    expect(mockOnDeny).toHaveBeenCalledTimes(1);
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
});
