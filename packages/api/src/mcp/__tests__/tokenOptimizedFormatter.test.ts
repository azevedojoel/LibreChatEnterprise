jest.mock('../formatters/json-to-toon', () => ({
  jsonToToonFormatter: (text: string) => `[TOON:${text.slice(0, 20)}...]`,
}));

import { tokenOptimizedFormatter } from '../formatters/token-optimized';

describe('tokenOptimizedFormatter', () => {
  describe('tasks_listTasks (Google)', () => {
    it('strips URLs and returns compact id|name|status|date format', () => {
      const input = JSON.stringify({
        items: [
          {
            id: 'abc123',
            title: 'Buy milk',
            status: 'needsAction',
            due: '2025-02-20T00:00:00.000Z',
            updated: '2025-02-17T10:00:00.000Z',
            selfLink: 'https://www.googleapis.com/tasks/v1/lists/listId/tasks/abc123',
            webViewLink: 'https://tasks.google.com/embed/view?ids=xyz',
            links: [{ type: 'web', link: 'https://example.com/task' }],
            etag: '"etag-value"',
            kind: 'tasks#task',
          },
          {
            id: 'def456',
            title: 'Review PR',
            status: 'completed',
            completed: '2025-02-17T12:00:00.000Z',
            updated: '2025-02-17T12:00:00.000Z',
            selfLink: 'https://www.googleapis.com/tasks/v1/lists/listId/tasks/def456',
          },
        ],
      });

      const result = tokenOptimizedFormatter(input, {
        serverName: 'Google',
        toolName: 'tasks_listTasks',
      });

      expect(result).not.toContain('https://');
      expect(result).not.toContain('selfLink');
      expect(result).not.toContain('webViewLink');
      expect(result).not.toContain('etag');
      expect(result).toContain('id | name | status | date');
      expect(result).toContain('abc123');
      expect(result).toContain('Buy milk');
      expect(result).toContain('needsAction');
      expect(result).toContain('2025-02-20');
      expect(result).toContain('def456');
      expect(result).toContain('Review PR');
      expect(result).toContain('completed');
      expect(result).toContain('2025-02-17');
    });

    it('includes nextPageToken when present', () => {
      const input = JSON.stringify({
        items: [{ id: 'x', title: 'Task', status: 'needsAction', updated: '2025-02-17' }],
        nextPageToken: 'token-xyz',
      });

      const result = tokenOptimizedFormatter(input, {
        serverName: 'Google',
        toolName: 'tasks_listTasks',
      });

      expect(result).toContain('nextPageToken: token-xyz');
    });

    it('returns (empty) for no items without nextPageToken', () => {
      const input = JSON.stringify({ items: [] });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Google',
        toolName: 'tasks_listTasks',
      });
      expect(result).toBe('(empty)');
    });
  });

  describe('tasks_listTaskLists (Google)', () => {
    it('returns compact id|name|date format', () => {
      const input = JSON.stringify({
        items: [
          { id: 'list1', title: 'Personal', updated: '2025-02-17T10:00:00.000Z' },
          { id: 'list2', title: 'Work', updated: '2025-02-16T09:00:00.000Z' },
        ],
      });

      const result = tokenOptimizedFormatter(input, {
        serverName: 'Google',
        toolName: 'tasks_listTaskLists',
      });

      expect(result).toContain('id | name | date');
      expect(result).toContain('list1');
      expect(result).toContain('Personal');
      expect(result).toContain('2025-02-17');
      expect(result).toContain('list2');
      expect(result).toContain('Work');
      expect(result).toContain('2025-02-16');
    });
  });

  describe('tool-only fallback', () => {
    it('transforms tasks_listTasks even with non-standard server name', () => {
      const input = JSON.stringify({
        items: [
          {
            id: 'x',
            title: 'Test task',
            status: 'needsAction',
            selfLink: 'https://example.com/verbose',
          },
        ],
      });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'MyCustomGoogle',
        toolName: 'tasks_listTasks',
      });

      expect(result).toContain('id | name | status | date');
      expect(result).toContain('Test task');
      expect(result).not.toContain('https://');
    });
  });

  describe('non-matching server/tool', () => {
    it('delegates to json-to-toon when server/tool not in registry', () => {
      const input = JSON.stringify({ items: [{ id: 'x', title: 'Task' }] });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'OtherServer',
        toolName: 'unknown.tool',
      });

      expect(result).toContain('[TOON:');
      expect(result).not.toContain('id | name | status | date');
    });

    it('delegates when ctx is missing', () => {
      const input = JSON.stringify({ items: [] });
      const result = tokenOptimizedFormatter(input);
      expect(result).toContain('[TOON:');
    });
  });

  describe('error responses', () => {
    it('passes through error message for { error: "..." }', () => {
      const input = JSON.stringify({ error: 'Invalid task list ID' });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Google',
        toolName: 'tasks_listTasks',
      });
      expect(result).toBe('Invalid task list ID');
    });
  });

  describe('gmail_search (Google)', () => {
    it('returns compact id|threadId table with nextPageToken and resultSizeEstimate', () => {
      const input = JSON.stringify({
        messages: [
          { id: 'msg1', threadId: 'th1' },
          { id: 'msg2', threadId: 'th2' },
        ],
        nextPageToken: 'page-xyz',
        resultSizeEstimate: 42,
      });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Google',
        toolName: 'gmail_search',
      });
      expect(result).toContain('id | threadId');
      expect(result).toContain('msg1');
      expect(result).toContain('th1');
      expect(result).toContain('nextPageToken: page-xyz');
      expect(result).toContain('resultSizeEstimate: 42');
    });
  });

  describe('gmail_get (Google)', () => {
    it('strips HTML from body and returns compact metadata', () => {
      const input = JSON.stringify({
        id: 'msg123',
        subject: 'Hello',
        from: 'alice@example.com',
        to: 'bob@example.com',
        date: '2025-02-17T10:00:00Z',
        body: '<html><body><p>This is <b>important</b> content.</p></body></html>',
        attachments: [{ filename: 'doc.pdf', size: 1024 }],
      });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Google',
        toolName: 'gmail_get',
      });
      expect(result).toContain('id: msg123');
      expect(result).toContain('subject: Hello');
      expect(result).toContain('from: alice@example.com');
      expect(result).not.toContain('<html>');
      expect(result).not.toContain('<p>');
      expect(result).toContain('important');
      expect(result).toContain('doc.pdf');
      expect(result).toContain('1024');
    });

    it('strips hrefs from links, keeping only link text', () => {
      const longUrl =
        'https://example.com/very/long/path/with/many/segments?utm_source=newsletter&utm_medium=email&utm_campaign=promo123';
      const input = JSON.stringify({
        id: 'msg456',
        subject: 'Check this',
        from: 'sender@example.com',
        to: 'recipient@example.com',
        date: '2025-02-17T10:00:00Z',
        body: `<p>Click <a href="${longUrl}">here</a> for more info.</p>`,
      });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Google',
        toolName: 'gmail_get',
      });
      expect(result).toContain('here');
      expect(result).toContain('Click');
      expect(result).not.toContain(longUrl);
      expect(result).not.toContain('utm_source');
    });
  });

  describe('calendar_listEvents (Google)', () => {
    it('returns compact id|summary|start|end|status table for raw array', () => {
      const input = JSON.stringify([
        {
          id: 'ev1',
          summary: 'Meeting',
          start: { dateTime: '2025-02-18T09:00:00Z' },
          end: { dateTime: '2025-02-18T10:00:00Z' },
          status: 'confirmed',
        },
      ]);
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Google',
        toolName: 'calendar_listEvents',
      });
      expect(result).toContain('id | summary | start | end | status');
      expect(result).toContain('ev1');
      expect(result).toContain('Meeting');
      expect(result).toContain('2025-02-18');
    });
  });

  describe('drive_search (Google)', () => {
    it('returns compact id|name|modifiedTime|mimeType table', () => {
      const input = JSON.stringify({
        files: [
          { id: 'f1', name: 'Report.pdf', modifiedTime: '2025-02-17T12:00:00Z', mimeType: 'application/pdf' },
        ],
        nextPageToken: 'tok',
      });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Google',
        toolName: 'drive_search',
      });
      expect(result).toContain('id | name | modifiedTime | mimeType');
      expect(result).toContain('f1');
      expect(result).toContain('Report.pdf');
      expect(result).toContain('nextPageToken: tok');
    });
  });

  describe('list-mail-messages (Microsoft)', () => {
    it('transforms OData value array to compact table', () => {
      const input = JSON.stringify({
        value: [
          {
            id: 'AAMkAGU',
            subject: 'Re: Project',
            sender: { emailAddress: { address: 'alice@contoso.com', name: 'Alice' } },
            receivedDateTime: '2025-02-17T14:00:00Z',
          },
        ],
        '@odata.nextLink': 'https://graph.microsoft.com/...',
      });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Microsoft',
        toolName: 'list-mail-messages',
      });
      expect(result).toContain('id | subject | from | receivedDateTime');
      expect(result).toContain('AAMkAGU');
      expect(result).toContain('Re: Project');
      expect(result).toContain('alice@contoso.com');
      expect(result).toContain('@odata.nextLink');
    });
  });

  describe('get-mail-message (Microsoft)', () => {
    it('strips HTML from body.content when contentType is html', () => {
      const input = JSON.stringify({
        id: 'AAMkAD',
        subject: 'Welcome',
        from: { emailAddress: { address: 'admin@contoso.com', name: 'Admin' } },
        body: {
          contentType: 'html',
          content: '<html><body><p>Welcome to the <strong>team</strong>!</p></body></html>',
        },
        bodyPreview: 'Welcome to the team!',
        receivedDateTime: '2025-02-17T09:00:00Z',
      });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Microsoft',
        toolName: 'get-mail-message',
      });
      expect(result).toContain('id: AAMkAD');
      expect(result).toContain('subject: Welcome');
      expect(result).not.toContain('<html>');
      expect(result).toContain('team');
    });
  });

  describe('list-calendar-events (Microsoft)', () => {
    it('transforms OData value to compact id|subject|start|end|location table', () => {
      const input = JSON.stringify({
        value: [
          {
            id: 'ev-1',
            subject: 'Standup',
            start: { dateTime: '2025-02-18T09:00:00' },
            end: { dateTime: '2025-02-18T09:30:00' },
            location: { displayName: 'Room 101' },
          },
        ],
      });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Microsoft',
        toolName: 'list-calendar-events',
      });
      expect(result).toContain('id | subject | start | end | location');
      expect(result).toContain('ev-1');
      expect(result).toContain('Standup');
      expect(result).toContain('Room 101');
    });
  });

  describe('list-folder-files (Microsoft)', () => {
    it('transforms OData value to compact id|name|size|lastModifiedDateTime|type table', () => {
      const input = JSON.stringify({
        value: [
          { id: 'item1', name: 'Notes.docx', size: 2048, file: {}, lastModifiedDateTime: '2025-02-17T10:00:00Z' },
          { id: 'item2', name: 'Photos', folder: {}, lastModifiedDateTime: '2025-02-16T08:00:00Z' },
        ],
      });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Microsoft',
        toolName: 'list-folder-files',
      });
      expect(result).toContain('id | name | size | lastModifiedDateTime | type');
      expect(result).toContain('Notes.docx');
      expect(result).toContain('Photos');
      expect(result).toContain('file');
      expect(result).toContain('folder');
    });
  });

  describe('list-todo-tasks (Microsoft)', () => {
    it('returns compact id|name|status|date format', () => {
      const input = JSON.stringify({
        value: [
          { id: 'task1', title: 'Review docs', status: 'notStarted', dueDateTime: { dateTime: '2025-02-20T17:00:00Z' } },
        ],
      });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Microsoft',
        toolName: 'list-todo-tasks',
      });
      expect(result).toContain('id | name | status | date');
      expect(result).toContain('task1');
      expect(result).toContain('Review docs');
      expect(result).toContain('notStarted');
    });
  });

  describe('list-todo-task-lists (Microsoft)', () => {
    it('returns compact id|name format', () => {
      const input = JSON.stringify({
        value: [{ id: 'list1', displayName: 'Work' }],
      });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Microsoft',
        toolName: 'list-todo-task-lists',
      });
      expect(result).toContain('id | name');
      expect(result).toContain('list1');
      expect(result).toContain('Work');
    });
  });
});
