jest.mock('../formatters/json-to-toon', () => ({
  jsonToToonFormatter: (text: string) => `[TOON:${text.slice(0, 20)}...]`,
}));

import { tokenOptimizedFormatter } from '../formatters/token-optimized';

describe('tokenOptimizedFormatter', () => {
  describe('tasks_listTasks (Google)', () => {
    it('returns compact JSON with i (items), n (name), s (status), d (date)', () => {
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
      const parsed = JSON.parse(result) as { i?: Array<{ id?: string; n?: string; s?: string; d?: string }> };
      expect(parsed.i).toHaveLength(2);
      expect(parsed.i?.[0]).toMatchObject({ id: 'abc123', n: 'Buy milk', s: 'needsAction', d: '2025-02-20' });
      expect(parsed.i?.[1]).toMatchObject({ id: 'def456', n: 'Review PR', s: 'completed', d: '2025-02-17' });
    });

    it('includes p (nextPageToken) when present', () => {
      const input = JSON.stringify({
        items: [{ id: 'x', title: 'Task', status: 'needsAction', updated: '2025-02-17' }],
        nextPageToken: 'token-xyz',
      });

      const result = tokenOptimizedFormatter(input, {
        serverName: 'Google',
        toolName: 'tasks_listTasks',
      });

      const parsed = JSON.parse(result) as { p?: string };
      expect(parsed.p).toBe('token-xyz');
    });

    it('returns empty items JSON for no items without nextPageToken', () => {
      const input = JSON.stringify({ items: [] });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Google',
        toolName: 'tasks_listTasks',
      });
      const parsed = JSON.parse(result) as { i?: unknown[] };
      expect(parsed.i).toEqual([]);
      expect(parsed).not.toHaveProperty('p');
    });
  });

  describe('tasks_listTaskLists (Google)', () => {
    it('returns compact JSON with i (items), n (name), d (date)', () => {
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

      const parsed = JSON.parse(result) as { i?: Array<{ id?: string; n?: string; d?: string }> };
      expect(parsed.i).toHaveLength(2);
      expect(parsed.i?.[0]).toMatchObject({ id: 'list1', n: 'Personal', d: '2025-02-17' });
      expect(parsed.i?.[1]).toMatchObject({ id: 'list2', n: 'Work', d: '2025-02-16' });
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

      const parsed = JSON.parse(result) as { i?: Array<{ n?: string }> };
      expect(parsed.i?.[0]?.n).toBe('Test task');
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
      expect(result).not.toMatch(/\{"i":/);
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
    it('returns compact JSON with m (messages), i (id), t (threadId)', () => {
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
      const parsed = JSON.parse(result) as { m?: Array<{ i?: string; t?: string }> };
      expect(parsed.m).toHaveLength(2);
      expect(parsed.m?.[0]).toEqual({ i: 'msg1', t: 'th1' });
      expect(parsed.m?.[1]).toEqual({ i: 'msg2', t: 'th2' });
    });

    it('includes s (subject), f (from), d (date), u/st/imp (labels), b (snippet) when present', () => {
      const input = JSON.stringify({
        messages: [
          {
            id: 'msg1',
            threadId: 'th1',
            subject: 'Re: Project update',
            from: 'alice@example.com',
            date: '2025-03-04',
            isUnread: true,
            isStarred: true,
            isImportant: false,
            snippet: 'Thanks for the update. I will review and get back to you soon.',
          },
          {
            id: 'msg2',
            threadId: 'th2',
            subject: 'A'.repeat(100),
            snippet: 'B'.repeat(150),
          },
        ],
      });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Google',
        toolName: 'gmail_search',
      });
      const parsed = JSON.parse(result) as {
        m?: Array<{ i?: string; s?: string; f?: string; d?: string; u?: boolean; st?: boolean; b?: string }>;
      };
      expect(parsed.m).toHaveLength(2);
      expect(parsed.m?.[0]).toEqual({
        i: 'msg1',
        t: 'th1',
        s: 'Re: Project update',
        f: 'alice@example.com',
        d: '2025-03-04',
        u: true,
        st: true,
        b: 'Thanks for the update. I will review and get back to you soon.',
      });
      expect(parsed.m?.[1].s).toHaveLength(80);
      expect(parsed.m?.[1].b).toHaveLength(100);
    });

    it('returns plain error string for { error: "..." } (formatter short-circuits before transform)', () => {
      const input = JSON.stringify({ error: 'Invalid query' });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Google',
        toolName: 'gmail_search',
      });
      expect(result).toBe('Invalid query');
    });
  });

  describe('gmail_get (Google)', () => {
    it('returns compact JSON with i, t, s, f, d, b (strips HTML from body)', () => {
      const input = JSON.stringify({
        id: 'msg123',
        threadId: 'th123',
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
      const parsed = JSON.parse(result) as { i?: string; t?: string; s?: string; f?: string; d?: string; b?: string };
      expect(parsed.i).toBe('msg123');
      expect(parsed.t).toBe('th123');
      expect(parsed.s).toBe('Hello');
      expect(parsed.f).toBe('alice@example.com');
      expect(parsed.d).toBe('2025-02-17');
      expect(parsed.b).toBeDefined();
      expect(parsed.b).toContain('important');
      expect(parsed.b).not.toContain('<html>');
    });

    it('strips hrefs from links, keeping only link text in body', () => {
      const longUrl =
        'https://example.com/very/long/path/with/many/segments?utm_source=newsletter&utm_medium=email&utm_campaign=promo123';
      const input = JSON.stringify({
        id: 'msg456',
        threadId: 'th456',
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
      const parsed = JSON.parse(result) as { b?: string };
      expect(parsed.b).toContain('here');
      expect(parsed.b).toContain('Click');
      expect(parsed.b).not.toContain(longUrl);
      expect(parsed.b).not.toContain('utm_source');
    });
  });

  describe('calendar_list (Google)', () => {
    it('returns compact JSON with c (calendars), i (id), s (summary)', () => {
      const input = JSON.stringify([
        { id: 'primary', summary: 'Primary Calendar' },
        { id: 'work@group.calendar.google.com', summary: 'Work' },
        { id: 'personal', summary: 'Personal' },
      ]);
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Google',
        toolName: 'calendar_list',
      });
      const parsed = JSON.parse(result) as { c?: Array<{ i?: string; s?: string }> };
      expect(parsed.c).toHaveLength(3);
      expect(parsed.c?.[0]).toEqual({ i: 'primary', s: 'Primary Calendar' });
      expect(parsed.c?.[1]).toEqual({ i: 'work@group.calendar.google.com', s: 'Work' });
      expect(parsed.c?.[2]).toEqual({ i: 'personal', s: 'Personal' });
    });

    it('returns plain error string for { error: "..." } (formatter short-circuits before transform)', () => {
      const input = JSON.stringify({ error: 'Calendar access denied' });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Google',
        toolName: 'calendar_list',
      });
      expect(result).toBe('Calendar access denied');
    });

    it('transforms calendar_list_mcp_Google via tool-only fallback', () => {
      const input = JSON.stringify([{ id: 'cal1', summary: 'My Calendar' }]);
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Google',
        toolName: 'calendar_list_mcp_Google',
      });
      const parsed = JSON.parse(result) as { c?: Array<{ i?: string; s?: string }> };
      expect(parsed.c).toHaveLength(1);
      expect(parsed.c?.[0]).toEqual({ i: 'cal1', s: 'My Calendar' });
    });
  });

  describe('calendar_listEvents (Google)', () => {
    it('returns compact JSON with ev (events), i, s, st, en', () => {
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
      const parsed = JSON.parse(result) as { ev?: Array<{ i?: string; s?: string; st?: unknown; en?: unknown }> };
      expect(parsed.ev).toHaveLength(1);
      expect(parsed.ev?.[0]).toMatchObject({ i: 'ev1', s: 'Meeting' });
      expect(parsed.ev?.[0].st).toEqual({ dateTime: '2025-02-18T09:00:00Z' });
      expect(parsed.ev?.[0].en).toEqual({ dateTime: '2025-02-18T10:00:00Z' });
    });
  });

  describe('calendar_createEvent, getEvent, updateEvent (Google)', () => {
    it('returns compact JSON with i, s, st, en for single event', () => {
      const input = JSON.stringify({
        id: 'ev123',
        summary: 'Team Standup',
        start: { dateTime: '2025-02-18T09:00:00Z' },
        end: { dateTime: '2025-02-18T09:30:00Z' },
        htmlLink: 'https://calendar.google.com/event/ev123',
      });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Google',
        toolName: 'calendar_createEvent',
      });
      const parsed = JSON.parse(result) as { i?: string; s?: string; st?: unknown; en?: unknown; h?: string };
      expect(parsed.i).toBe('ev123');
      expect(parsed.s).toBe('Team Standup');
      expect(parsed.st).toEqual({ dateTime: '2025-02-18T09:00:00Z' });
      expect(parsed.h).toBe('https://calendar.google.com/event/ev123');
    });
  });

  describe('calendar_findFreeTime (Google)', () => {
    it('returns compact JSON with st, en for single slot', () => {
      const input = JSON.stringify({
        start: '2025-02-18T09:00:00Z',
        end: '2025-02-18T10:00:00Z',
      });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Google',
        toolName: 'calendar_findFreeTime',
      });
      const parsed = JSON.parse(result) as { st?: string; en?: string };
      expect(parsed.st).toBe('2025-02-18T09:00:00Z');
      expect(parsed.en).toBe('2025-02-18T10:00:00Z');
    });
  });

  describe('calendar_respondToEvent (Google)', () => {
    it('returns compact JSON with i, s, r, m', () => {
      const input = JSON.stringify({
        eventId: 'ev456',
        summary: 'Project Review',
        responseStatus: 'accepted',
        message: 'Successfully accepted the meeting invitation',
      });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Google',
        toolName: 'calendar_respondToEvent',
      });
      const parsed = JSON.parse(result) as { i?: string; s?: string; r?: string; m?: string };
      expect(parsed.i).toBe('ev456');
      expect(parsed.s).toBe('Project Review');
      expect(parsed.r).toBe('accepted');
      expect(parsed.m).toContain('Successfully accepted');
    });
  });

  describe('calendar_deleteEvent (Google)', () => {
    it('returns compact JSON with ok for success', () => {
      const input = JSON.stringify({ message: 'Successfully deleted event ev123' });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Google',
        toolName: 'calendar_deleteEvent',
      });
      const parsed = JSON.parse(result) as { ok?: boolean };
      expect(parsed.ok).toBe(true);
    });
  });

  describe('drive_search (Google)', () => {
    it('returns compact JSON with f (files), i (id), n (name), m (modifiedTime)', () => {
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
      const parsed = JSON.parse(result) as { f?: Array<{ i?: string; n?: string; m?: string }> };
      expect(parsed.f).toHaveLength(1);
      expect(parsed.f?.[0]).toEqual({ i: 'f1', n: 'Report.pdf', m: '2025-02-17' });
    });

    it('returns plain error string for { error: "..." } (formatter short-circuits before transform)', () => {
      const input = JSON.stringify({ error: 'Access denied' });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Google',
        toolName: 'drive_search',
      });
      expect(result).toBe('Access denied');
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
    it('returns compact JSON with i (items), n (name), s (status), d (date)', () => {
      const input = JSON.stringify({
        value: [
          { id: 'task1', title: 'Review docs', status: 'notStarted', dueDateTime: { dateTime: '2025-02-20T17:00:00Z' } },
        ],
      });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Microsoft',
        toolName: 'list-todo-tasks',
      });
      const parsed = JSON.parse(result) as { i?: Array<{ id?: string; n?: string; s?: string; d?: string }> };
      expect(parsed.i).toHaveLength(1);
      expect(parsed.i?.[0]).toMatchObject({ id: 'task1', n: 'Review docs', s: 'notStarted', d: '2025-02-20' });
    });
  });

  describe('list-todo-task-lists (Microsoft)', () => {
    it('returns compact JSON with i (items), id, n (name)', () => {
      const input = JSON.stringify({
        value: [{ id: 'list1', displayName: 'Work' }],
      });
      const result = tokenOptimizedFormatter(input, {
        serverName: 'Microsoft',
        toolName: 'list-todo-task-lists',
      });
      const parsed = JSON.parse(result) as { i?: Array<{ id?: string; n?: string }> };
      expect(parsed.i).toHaveLength(1);
      expect(parsed.i?.[0]).toMatchObject({ id: 'list1', n: 'Work' });
    });
  });
});
