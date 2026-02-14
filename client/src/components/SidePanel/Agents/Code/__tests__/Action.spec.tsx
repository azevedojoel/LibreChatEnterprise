/**
 * Code Action - no API key UI (code runs locally)
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import '@testing-library/jest-dom';
import Action from '../Action';
import type { AgentForm } from '~/common';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) =>
    ({
      com_ui_run_code: 'Run Code',
      com_agents_code_interpreter: 'Code Interpreter',
    })[key] ?? key,
}));

jest.mock('@librechat/client', () => ({
  Checkbox: (props: Record<string, unknown>) => (
    <input
      type="checkbox"
      data-testid="execute-code-checkbox"
      {...props}
      onChange={(e) => props.onCheckedChange?.(e.target.checked)}
    />
  ),
  HoverCard: ({ children }: { children: React.ReactNode }) => <div data-testid="hover-card">{children}</div>,
  HoverCardContent: () => null,
  HoverCardPortal: ({ children }: { children: React.ReactNode }) => children,
  HoverCardTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <span data-testid="help-trigger">{children}</span> : <div>{children}</div>,
  CircleHelpIcon: () => <span data-testid="help-icon" />,
}));

function TestWrapper({ children }: { children: React.ReactNode }) {
  const methods = useForm<AgentForm>({
    defaultValues: {
      [require('librechat-data-provider').AgentCapabilities.execute_code]: false,
    },
  });
  return <FormProvider {...methods}>{children}</FormProvider>;
}

describe('Code Action (no API key)', () => {
  it('renders execute code checkbox without API key button', () => {
    render(
      <TestWrapper>
        <Action />
      </TestWrapper>,
    );

    expect(screen.getByText('Run Code')).toBeInTheDocument();
    expect(screen.getByTestId('execute-code-checkbox')).toBeInTheDocument();
    expect(screen.getByTestId('help-trigger')).toBeInTheDocument();
    expect(screen.queryByLabelText(/api key|add code interpreter api key/i)).not.toBeInTheDocument();
  });

  it('does not render ApiKeyDialog or KeyRoundIcon (API key flow removed)', () => {
    render(
      <TestWrapper>
        <Action />
      </TestWrapper>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('key-round-icon')).not.toBeInTheDocument();
  });
});
