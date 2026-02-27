import { registerToolOnlyFallback } from './registry';
import { stripHtml } from './utils';

/** Google Calendar: raw array of events */
type GoogleCalendarEvent = {
  id?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  description?: string;
  status?: string;
  [key: string]: unknown;
};

/** Google Drive search response */
type GoogleDriveSearchResponse = {
  files?: Array<{
    id?: string;
    name?: string;
    modifiedTime?: string;
    mimeType?: string;
  }>;
  nextPageToken?: string;
  error?: string;
};

/** Microsoft OData value response */
type ODataValueResponse<T> = {
  value?: T[];
  '@odata.nextLink'?: string;
  error?: { message?: string };
};

/** Microsoft Graph Event */
type GraphEvent = {
  id?: string;
  subject?: string;
  body?: { contentType?: string; content?: string };
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  location?: { displayName?: string };
  locationDisplayName?: string;
  status?: string;
  [key: string]: unknown;
};

/** Microsoft Graph DriveItem */
type GraphDriveItem = {
  id?: string;
  name?: string;
  size?: number;
  file?: unknown;
  folder?: unknown;
  lastModifiedDateTime?: string;
  [key: string]: unknown;
};

/** Microsoft To Do task list */
type GraphTodoTaskList = {
  id?: string;
  displayName?: string;
  [key: string]: unknown;
};

/** Microsoft To Do task */
type GraphTodoTask = {
  id?: string;
  title?: string;
  status?: string;
  dueDateTime?: { dateTime?: string };
  [key: string]: unknown;
};

function formatDate(val: unknown): string {
  if (typeof val !== 'string') return '-';
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? String(val) : d.toISOString().split('T')[0];
}

function escapeCell(val: string): string {
  return val.replace(/\|/g, '\\|').trim() || '-';
}

function extractDateTime(obj: { dateTime?: string; date?: string } | undefined): string {
  if (!obj) return '-';
  const v = obj.dateTime ?? obj.date;
  return formatDate(v);
}

// --- Google Calendar ---
function transformCalendarListEvents(parsed: unknown): string {
  const arr = Array.isArray(parsed) ? parsed : [];
  if (arr.length === 0) return '(empty)';
  const rows = arr.map((e: GoogleCalendarEvent) => {
    const id = e?.id ?? '-';
    const summary = escapeCell(String(e?.summary ?? '-'));
    const start = extractDateTime(e?.start);
    const end = extractDateTime(e?.end);
    const status = e?.status ?? '-';
    return `${id} | ${summary} | ${start} | ${end} | ${status}`;
  });
  const header = 'id | summary | start | end | status';
  const sep = '---|--------|------|----|--------';
  return [header, sep, ...rows].join('\n');
}

// --- Google Drive ---
function transformDriveSearch(parsed: unknown): string {
  const data = parsed as GoogleDriveSearchResponse;
  if (data?.error) return data.error;
  const items = data?.files ?? [];
  if (items.length === 0) {
    const suffix = data?.nextPageToken ? `\nnextPageToken: ${data.nextPageToken}` : '';
    return `(empty)${suffix}`;
  }
  const rows = items.map((f) => {
    const id = f?.id ?? '-';
    const name = escapeCell(String(f?.name ?? '-'));
    const modified = formatDate(f?.modifiedTime);
    const mime = f?.mimeType ?? '-';
    return `${id} | ${name} | ${modified} | ${mime}`;
  });
  const header = 'id | name | modifiedTime | mimeType';
  const sep = '---|------|-------------|---------';
  let body = [header, sep, ...rows].join('\n');
  if (data?.nextPageToken) body += `\nnextPageToken: ${data.nextPageToken}`;
  return body;
}

// --- Microsoft Calendar ---
function transformMicrosoftCalendarList(parsed: unknown): string {
  const data = parsed as ODataValueResponse<GraphEvent>;
  if (data?.error?.message) return data.error.message;
  const items = data?.value ?? [];
  if (items.length === 0) {
    const suffix = data?.['@odata.nextLink'] ? `\n@odata.nextLink: (has more)` : '';
    return `(empty)${suffix}`;
  }
  const rows = items.map((e) => {
    const id = e?.id ?? '-';
    const subject = escapeCell(String(e?.subject ?? '-'));
    const start = extractDateTime(e?.start);
    const end = extractDateTime(e?.end);
    const loc = escapeCell(String(e?.location?.displayName ?? e?.locationDisplayName ?? '-'));
    return `${id} | ${subject} | ${start} | ${end} | ${loc}`;
  });
  const header = 'id | subject | start | end | location';
  const sep = '---|--------|------|----|---------';
  let body = [header, sep, ...rows].join('\n');
  if (data?.['@odata.nextLink']) body += '\n@odata.nextLink: (has more)';
  return body;
}

function transformGetCalendarEvent(parsed: unknown): string {
  const data = parsed as GraphEvent & { error?: { message?: string } };
  if (data?.error) {
    const msg = typeof data.error === 'string' ? data.error : data.error?.message;
    return msg ?? 'Unknown error';
  }
  const parts: string[] = [];
  parts.push(`id: ${data?.id ?? '-'}`);
  parts.push(`subject: ${escapeCell(String(data?.subject ?? '-'))}`);
  parts.push(`start: ${extractDateTime(data?.start)}`);
  parts.push(`end: ${extractDateTime(data?.end)}`);
  const loc = data?.location?.displayName ?? data?.locationDisplayName ?? '-';
  parts.push(`location: ${escapeCell(String(loc))}`);
  const rawBody = data?.body?.content ?? '';
  if (rawBody) {
    const isHtml = data?.body?.contentType === 'html';
    const bodyText = isHtml ? stripHtml(rawBody, { maxLength: 500 }) : rawBody;
    parts.push(`body: ${escapeCell(bodyText).slice(0, 500)}`);
  }
  return parts.join('\n');
}

// --- Microsoft OneDrive / Files ---
function transformListFolderFiles(parsed: unknown): string {
  const data = parsed as ODataValueResponse<GraphDriveItem>;
  if (data?.error?.message) return data.error.message;
  const items = data?.value ?? [];
  if (items.length === 0) {
    const suffix = data?.['@odata.nextLink'] ? `\n@odata.nextLink: (has more)` : '';
    return `(empty)${suffix}`;
  }
  const rows = items.map((f) => {
    const id = f?.id ?? '-';
    const name = escapeCell(String(f?.name ?? '-'));
    const size = f?.size ?? '-';
    const modified = formatDate(f?.lastModifiedDateTime);
    const type = f?.folder ? 'folder' : 'file';
    return `${id} | ${name} | ${size} | ${modified} | ${type}`;
  });
  const header = 'id | name | size | lastModifiedDateTime | type';
  const sep = '---|------|-----|--------------------|------';
  let body = [header, sep, ...rows].join('\n');
  if (data?.['@odata.nextLink']) body += '\n@odata.nextLink: (has more)';
  return body;
}

// --- Microsoft To Do ---
function transformListTodoTaskLists(parsed: unknown): string {
  const data = parsed as ODataValueResponse<GraphTodoTaskList>;
  if (data?.error?.message) return data.error.message;
  const items = data?.value ?? [];
  if (items.length === 0) {
    const suffix = data?.['@odata.nextLink'] ? `\n@odata.nextLink: (has more)` : '';
    return `(empty)${suffix}`;
  }
  const rows = items.map((t) => {
    const id = t?.id ?? '-';
    const name = escapeCell(String(t?.displayName ?? '-'));
    return `${id} | ${name}`;
  });
  const header = 'id | name';
  const sep = '---|------';
  let body = [header, sep, ...rows].join('\n');
  if (data?.['@odata.nextLink']) body += '\n@odata.nextLink: (has more)';
  return body;
}

function transformListTodoTasks(parsed: unknown): string {
  const data = parsed as ODataValueResponse<GraphTodoTask>;
  if (data?.error?.message) return data.error.message;
  const items = data?.value ?? [];
  if (items.length === 0) {
    const suffix = data?.['@odata.nextLink'] ? `\n@odata.nextLink: (has more)` : '';
    return `(empty)${suffix}`;
  }
  const rows = items.map((t) => {
    const id = t?.id ?? '-';
    const title = escapeCell(String(t?.title ?? '-'));
    const status = t?.status ?? '-';
    const date = formatDate(t?.dueDateTime?.dateTime ?? t?.dueDateTime);
    return `${id} | ${title} | ${status} | ${date}`;
  });
  const header = 'id | name | status | date';
  const sep = '---|------|--------|----------';
  let body = [header, sep, ...rows].join('\n');
  if (data?.['@odata.nextLink']) body += '\n@odata.nextLink: (has more)';
  return body;
}

export function registerCommonTransforms(): void {
  registerToolOnlyFallback('calendar_listEvents', transformCalendarListEvents);
  registerToolOnlyFallback('drive_search', transformDriveSearch);

  const MS_CALENDAR_LIST_TOOLS = [
    'list-calendar-events',
    'get-calendar-view',
    'get-specific-calendar-view',
  ];
  const MS_CALENDAR_GET_TOOLS = ['get-calendar-event', 'get-specific-calendar-event'];
  for (const tool of MS_CALENDAR_LIST_TOOLS) {
    registerToolOnlyFallback(tool, transformMicrosoftCalendarList);
  }
  for (const tool of MS_CALENDAR_GET_TOOLS) {
    registerToolOnlyFallback(tool, transformGetCalendarEvent);
  }
  registerToolOnlyFallback('list-folder-files', transformListFolderFiles);
  registerToolOnlyFallback('list-todo-task-lists', transformListTodoTaskLists);
  registerToolOnlyFallback('list-todo-tasks', transformListTodoTasks);
}
