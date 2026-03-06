/**
 * Unit tests for formatEmailHighlights - tool approval email formatting.
 * Run: npm test -- formatEmailHighlights.spec.js
 */
jest.mock('librechat-data-provider', () => ({
  ContentTypes: { TEXT: 'text', TOOL_CALL: 'tool_call' },
  Constants: {
    LC_TRANSFER_TO_: 'lc_transfer_to_',
    TOOL_SEARCH: 'tool_search',
    mcp_delimiter: '_mcp_',
  },
}));
jest.mock('marked', () => ({
  marked: { parse: (md) => md },
  Renderer: function () {},
}));
jest.mock('sanitize-html', () => (html) => html);

const {
  formatToolApprovalEmail,
  buildToolApprovalSubject,
  formatHumanNotifyEmail,
  buildHumanNotifySubject,
} = require('./formatEmailHighlights');

describe('formatEmailHighlights - tool approval', () => {
  describe('buildToolApprovalSubject', () => {
    it('returns subject with tool display name and default app name', () => {
      const result = buildToolApprovalSubject({ toolName: 'workspace_delete_file' });
      expect(result).toMatch(/^Approval needed: .+ — Daily Thread$/);
      expect(result).toContain('Delete File');
    });

    it('includes context from argsSummary when priority key present', () => {
      // Priority keys order: name, contact, to, record, subject, title, email - first match wins
      const result = buildToolApprovalSubject({
        toolName: 'gmail_send',
        argsSummary: JSON.stringify({ to: 'user@example.com', subject: 'Meeting tomorrow' }),
      });
      expect(result).toContain('user@example.com');
      expect(result).toMatch(/Approval needed: .+ for .+ — .+$/);
    });

    it('truncates context to 40 chars', () => {
      const longSubject = 'A'.repeat(50);
      const result = buildToolApprovalSubject({
        toolName: 'gmail_send',
        argsSummary: JSON.stringify({ subject: longSubject }),
      });
      expect(result).toContain('A'.repeat(40) + '…');
    });

    it('uses custom appName when provided', () => {
      const result = buildToolApprovalSubject(
        { toolName: 'workspace_delete_file' },
        { appName: 'My App' },
      );
      expect(result).toContain('— My App');
    });

    it('handles invalid argsSummary gracefully', () => {
      const result = buildToolApprovalSubject({
        toolName: 'workspace_delete_file',
        argsSummary: 'not valid json',
      });
      expect(result).toMatch(/^Approval needed: Delete File — .+$/);
    });

    it('handles empty argsSummary', () => {
      const result = buildToolApprovalSubject({
        toolName: 'workspace_delete_file',
        argsSummary: '',
      });
      expect(result).toMatch(/^Approval needed: Delete File — .+$/);
    });
  });

  describe('formatToolApprovalEmail', () => {
    it('returns html and text with tool name and approval URL', () => {
      const { html, text } = formatToolApprovalEmail({
        toolName: 'workspace_delete_file',
        approvalUrl: 'https://app.example.com/approve/123',
      });

      expect(html).toContain('Tool approval required');
      expect(html).toContain('Delete File');
      expect(html).toContain('https://app.example.com/approve/123');
      expect(html).toContain('Approve');
      expect(html).toContain('Deny');

      expect(text).toContain('Your agent requested approval');
      expect(text).toContain('Delete File');
      expect(text).toContain('https://app.example.com/approve/123');
    });

    it('includes parsed args as bubbles when argsSummary is valid JSON', () => {
      const { html, text } = formatToolApprovalEmail({
        toolName: 'gmail_send',
        argsSummary: JSON.stringify({ to: 'user@example.com', subject: 'Hello' }),
        approvalUrl: 'https://app.example.com/approve',
      });

      expect(html).toContain('To');
      expect(html).toContain('user@example.com');
      expect(html).toContain('Subject');
      expect(html).toContain('Hello');

      expect(text).toContain('To: user@example.com');
      expect(text).toContain('Subject: Hello');
    });

    it('skips keys starting with underscore', () => {
      const { html } = formatToolApprovalEmail({
        toolName: 'gmail_send',
        argsSummary: JSON.stringify({ _internal: 'secret', to: 'user@example.com' }),
        approvalUrl: 'https://app.example.com/approve',
      });

      expect(html).not.toContain('_internal');
      expect(html).not.toContain('secret');
      expect(html).toContain('user@example.com');
    });

    it('uses custom appName when provided', () => {
      const { html, text } = formatToolApprovalEmail(
        {
          toolName: 'workspace_delete_file',
          approvalUrl: 'https://app.example.com/approve',
        },
        { appName: 'Custom App' },
      );

      expect(html).toContain('Custom App');
      expect(text).toBeDefined();
    });

    it('escapes HTML in approval URL', () => {
      const maliciousUrl = 'https://evil.com"><script>alert(1)</script>';
      const { html } = formatToolApprovalEmail({
        toolName: 'workspace_delete_file',
        approvalUrl: maliciousUrl,
      });

      expect(html).not.toContain('<script>');
      expect(html).toContain('&quot;');
    });

    it('handles missing approvalUrl', () => {
      const { html, text } = formatToolApprovalEmail({
        toolName: 'workspace_delete_file',
      });

      expect(html).toContain('href="#"');
      expect(text).toContain('approve or deny');
      expect(text).toContain('This link expires in 1 hour');
    });
  });
});

describe('formatEmailHighlights - human notification', () => {
  describe('buildHumanNotifySubject', () => {
    it('returns subject with message preview and default app name', () => {
      const result = buildHumanNotifySubject({ message: 'Please review the report' });
      expect(result).toMatch(/^Team notification: .+ — Daily Thread$/);
      expect(result).toContain('Please review the report');
    });

    it('truncates long message with ellipsis', () => {
      const longMessage = 'A'.repeat(60);
      const result = buildHumanNotifySubject({ message: longMessage });
      expect(result).toContain('A'.repeat(47) + '…');
    });

    it('uses custom appName when provided', () => {
      const result = buildHumanNotifySubject(
        { message: 'Hello' },
        { appName: 'My App' },
      );
      expect(result).toContain('— My App');
    });
  });

  describe('formatHumanNotifyEmail', () => {
    it('returns html and text with message and Open conversation link when convUrl provided', () => {
      const { html, text } = formatHumanNotifyEmail({
        message: 'Please review the attached document',
        convUrl: 'https://app.example.com/c/conv123',
        appName: 'Test App',
      });

      expect(html).toContain('Team member notification');
      expect(html).toContain('Please review the attached document');
      expect(html).toContain('https://app.example.com/c/conv123');
      expect(html).toContain('Open conversation');
      expect(html).toContain('Test App');

      expect(text).toContain('Please review the attached document');
      expect(text).toContain('Open conversation: https://app.example.com/c/conv123');
    });

    it('includes context block when context provided', () => {
      const { html, text } = formatHumanNotifyEmail({
        message: 'Action needed',
        context: 'The client requested an update by EOD',
        appName: 'Test App',
      });

      expect(html).toContain('Context');
      expect(html).toContain('The client requested an update by EOD');
      expect(text).toContain('Context: The client requested an update by EOD');
    });

    it('shows Contact conversation owner when no convUrl', () => {
      const { html, text } = formatHumanNotifyEmail({
        message: 'FYI: Task completed',
        appName: 'Test App',
      });

      expect(html).toContain('Contact the conversation owner');
      expect(text).toContain('Contact the conversation owner if you need to respond.');
    });

    it('uses custom appName when provided in options', () => {
      const { html } = formatHumanNotifyEmail(
        { message: 'Hello' },
        { appName: 'Custom App' },
      );

      expect(html).toContain('Custom App');
    });

    it('escapes HTML in context', () => {
      const { html } = formatHumanNotifyEmail({
        message: 'Please review',
        context: 'Context with "quotes" & ampersands',
      });

      expect(html).toContain('&quot;');
      expect(html).toContain('&amp;');
    });
  });
});
