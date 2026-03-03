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
  bodyPreview?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  location?: { displayName?: string };
  locationDisplayName?: string;
  webLink?: string;
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
/** Compact JSON for custom UI: c=calendars, c[].i=id, c[].s=summary, e=error */
function transformCalendarList(parsed: unknown): string {
  const data = parsed as { error?: string } | unknown[];
  if (
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    'error' in data &&
    typeof (data as { error?: string }).error === 'string'
  ) {
    return JSON.stringify({ e: (data as { error: string }).error });
  }
  const arr = Array.isArray(parsed) ? parsed : [];
  const c = arr.map((cal: { id?: string; summary?: string }) => {
    const o: { i?: string; s?: string } = {};
    if (cal?.id) o.i = cal.id;
    const summary = (cal?.summary ?? '').trim();
    if (summary) o.s = summary.slice(0, 200);
    return o;
  });
  return JSON.stringify({ c });
}

/** Compact JSON for custom UI: ev=events, ev[].i=id, ev[].s=summary, ev[].st=start, ev[].en=end, ev[].d=description, ev[].h=htmlLink, ev[].l=location, e=error */
function transformCalendarListEvents(parsed: unknown): string {
  const data = parsed as { error?: string } | unknown[];
  if (
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    'error' in data &&
    typeof (data as { error?: string }).error === 'string'
  ) {
    return JSON.stringify({ e: (data as { error: string }).error });
  }
  const arr = Array.isArray(parsed) ? parsed : [];
  const ev = arr.map((e: GoogleCalendarEvent) => {
    const o: Record<string, unknown> = {};
    if (e?.id) o.i = e.id;
    const summary = (e?.summary ?? '').trim();
    if (summary) o.s = summary.slice(0, 200);
    if (e?.start) o.st = e.start;
    if (e?.end) o.en = e.end;
    if (e?.description) o.d = String(e.description).slice(0, 500);
    if (e?.htmlLink) o.h = e.htmlLink;
    if (e?.location) o.l = typeof e.location === 'string' ? e.location : (e.location as { displayName?: string })?.displayName;
    return o;
  });
  return JSON.stringify({ ev });
}

/** Compact JSON for single event: i=id, s=summary, st=start, en=end, d=description, h=htmlLink, l=location, e=error */
function transformCalendarEvent(parsed: unknown): string {
  const data = parsed as GoogleCalendarEvent & { error?: string };
  if (data?.error) return JSON.stringify({ e: data.error });
  const o: Record<string, unknown> = {};
  if (data?.id) o.i = data.id;
  const summary = (data?.summary ?? '').trim();
  if (summary) o.s = summary.slice(0, 200);
  if (data?.start) o.st = data.start;
  if (data?.end) o.en = data.end;
  if (data?.description) o.d = String(data.description).slice(0, 500);
  if (data?.htmlLink) o.h = data.htmlLink;
  if (data?.location) o.l = typeof data.location === 'string' ? data.location : (data.location as { displayName?: string })?.displayName;
  return JSON.stringify(o);
}

/** Compact JSON for find free time: st=start, en=end, sl=slots, e=error */
function transformCalendarFindFreeTime(parsed: unknown): string {
  const data = parsed as { start?: string; end?: string; slots?: Array<{ start?: string; end?: string }>; error?: string };
  if (data?.error) return JSON.stringify({ e: data.error });
  if (data?.start && data?.end) return JSON.stringify({ st: data.start, en: data.end });
  const sl = data?.slots ?? [];
  const slots = sl.map((s: { start?: string; end?: string }) => ({ st: s?.start, en: s?.end }));
  return JSON.stringify({ sl: slots });
}

/** Compact JSON for respond: i=eventId, s=summary, r=responseStatus, m=message, e=error */
function transformCalendarRespond(parsed: unknown): string {
  const data = parsed as { eventId?: string; summary?: string; responseStatus?: string; message?: string; error?: string };
  if (data?.error) return JSON.stringify({ e: data.error });
  const o: Record<string, unknown> = {};
  if (data?.eventId) o.i = data.eventId;
  if (data?.summary) o.s = String(data.summary).slice(0, 200);
  if (data?.responseStatus) o.r = data.responseStatus;
  if (data?.message) o.m = String(data.message).slice(0, 500);
  return JSON.stringify(o);
}

/** Compact JSON for delete: ok=success, e=error */
function transformCalendarDelete(parsed: unknown): string {
  const data = parsed as { message?: string; error?: string };
  if (data?.error) return JSON.stringify({ e: data.error });
  return JSON.stringify({ ok: true });
}

// --- Google Docs ---
/** Compact JSON for custom UI: d=documentId, t=title, e=error */
function transformDocsCreate(parsed: unknown): string {
  const data = parsed as { documentId?: string; title?: string; error?: string };
  if (data?.error) return JSON.stringify({ e: data.error });
  const o: { d?: string; t?: string } = {};
  if (data?.documentId) o.d = data.documentId;
  if (data?.title) o.t = String(data.title).trim();
  return JSON.stringify(o);
}

// --- Google Drive ---
/** Compact JSON for custom UI: f=files, f[].i=id, f[].n=name, f[].m=modifiedTime, e=error */
function transformDriveSearch(parsed: unknown): string {
  const data = parsed as GoogleDriveSearchResponse;
  if (data?.error) return JSON.stringify({ e: data.error });
  const items = data?.files ?? [];
  const f = items.map((file) => {
    const o: { i?: string; n?: string; m?: string } = {};
    if (file?.id) o.i = file.id;
    if (file?.name) o.n = String(file.name).trim();
    if (file?.modifiedTime) {
      const m = formatDate(file.modifiedTime);
      if (m !== '-') o.m = m;
    }
    return o;
  });
  return JSON.stringify({ f });
}

// --- Microsoft Calendar ---
/** Compact JSON for single event: i=id, s=subject, st=start, en=end, d=bodyPreview, h=webLink, l=location, e=error */
function transformMSCalendarEvent(parsed: unknown): string {
  const data = parsed as GraphEvent & { error?: string | { message?: string } };
  const err = data?.error;
  if (err) {
    const msg = typeof err === 'string' ? err : err?.message;
    return JSON.stringify({ e: msg ?? 'Unknown error' });
  }
  const o: Record<string, unknown> = {};
  if (data?.id) o.i = data.id;
  const subject = String(data?.subject ?? '').trim();
  if (subject) o.s = subject.slice(0, 200);
  if (data?.start) o.st = data.start;
  if (data?.end) o.en = data.end;
  const rawBody = data?.body?.content ?? data?.bodyPreview ?? '';
  if (rawBody) {
    const isHtml = data?.body?.contentType === 'html';
    const bodyText = isHtml ? stripHtml(rawBody, { maxLength: 500 }) : String(rawBody).slice(0, 500);
    if (bodyText) o.d = bodyText;
  }
  if (data?.webLink) o.h = data.webLink;
  const loc = data?.location?.displayName ?? data?.locationDisplayName ?? '';
  if (loc) o.l = String(loc).slice(0, 200);
  return JSON.stringify(o);
}

/** Compact JSON for list: ev=events, ev[].i, ev[].s, ev[].st, ev[].en, ev[].l, ev[].h, e=error */
function transformMSCalendarList(parsed: unknown): string {
  const data = parsed as ODataValueResponse<GraphEvent>;
  if (data?.error?.message) return JSON.stringify({ e: data.error.message });
  const items = data?.value ?? [];
  const ev = items.map((e) => {
    const o: Record<string, unknown> = {};
    if (e?.id) o.i = e.id;
    const subject = String(e?.subject ?? '').trim();
    if (subject) o.s = subject.slice(0, 200);
    if (e?.start) o.st = e.start;
    if (e?.end) o.en = e.end;
    const loc = e?.location?.displayName ?? e?.locationDisplayName ?? '';
    if (loc) o.l = String(loc).slice(0, 200);
    if (e?.webLink) o.h = e.webLink;
    return o;
  });
  return JSON.stringify({ ev });
}

/** Compact JSON for delete: ok=success, e=error */
function transformMSCalendarDelete(parsed: unknown): string {
  if (parsed == null) return JSON.stringify({ ok: true });
  const data = parsed as { message?: string; error?: string | { message?: string } };
  if (data?.error) {
    const msg = typeof data.error === 'string' ? data.error : data.error?.message;
    return JSON.stringify({ e: msg ?? 'Unknown error' });
  }
  return JSON.stringify({ ok: true });
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
/** Compact JSON for custom UI: i=items, i[].id, i[].n=name, e=error */
function transformListTodoTaskLists(parsed: unknown): string {
  const data = parsed as ODataValueResponse<GraphTodoTaskList>;
  if (data?.error?.message) return JSON.stringify({ e: data.error.message });
  const items = data?.value ?? [];
  const i = items.map((t) => {
    const o: { id?: string; n?: string } = {};
    if (t?.id) o.id = t.id;
    const name = String(t?.displayName ?? '').trim();
    if (name) o.n = name.slice(0, 200);
    return o;
  });
  return JSON.stringify({ i });
}

/** Compact JSON for custom UI: i=items, i[].id, i[].n=name, i[].s=status, i[].d=date, e=error */
function transformListTodoTasks(parsed: unknown): string {
  const data = parsed as ODataValueResponse<GraphTodoTask>;
  if (data?.error?.message) return JSON.stringify({ e: data.error.message });
  const items = data?.value ?? [];
  const i = items.map((t) => {
    const o: { id?: string; n?: string; s?: string; d?: string } = {};
    if (t?.id) o.id = t.id;
    const name = String(t?.title ?? '').trim();
    if (name) o.n = name.slice(0, 200);
    if (t?.status) o.s = t.status;
    const date = formatDate(t?.dueDateTime?.dateTime ?? t?.dueDateTime);
    if (date !== '-') o.d = date;
    return o;
  });
  return JSON.stringify({ i });
}

export function registerCommonTransforms(): void {
  registerToolOnlyFallback('calendar_list', transformCalendarList);
  registerToolOnlyFallback('calendar_listEvents', transformCalendarListEvents);
  registerToolOnlyFallback('calendar_createEvent', transformCalendarEvent);
  registerToolOnlyFallback('calendar_getEvent', transformCalendarEvent);
  registerToolOnlyFallback('calendar_updateEvent', transformCalendarEvent);
  registerToolOnlyFallback('calendar_findFreeTime', transformCalendarFindFreeTime);
  registerToolOnlyFallback('calendar_respondToEvent', transformCalendarRespond);
  registerToolOnlyFallback('calendar_deleteEvent', transformCalendarDelete);
  registerToolOnlyFallback('docs_create', transformDocsCreate);
  registerToolOnlyFallback('drive_search', transformDriveSearch);

  const MS_CALENDAR_LIST_TOOLS = [
    'list-calendar-events',
    'list-specific-calendar-events',
    'get-calendar-view',
    'get-specific-calendar-view',
    'list-calendar-event-instances',
  ];
  const MS_CALENDAR_GET_TOOLS = ['get-calendar-event', 'get-specific-calendar-event'];
  const MS_CALENDAR_EVENT_TOOLS = [
    'create-calendar-event',
    'update-calendar-event',
    'create-specific-calendar-event',
    'update-specific-calendar-event',
  ];
  const MS_CALENDAR_DELETE_TOOLS = ['delete-calendar-event', 'delete-specific-calendar-event'];
  for (const tool of MS_CALENDAR_LIST_TOOLS) {
    registerToolOnlyFallback(tool, transformMSCalendarList);
  }
  for (const tool of MS_CALENDAR_GET_TOOLS) {
    registerToolOnlyFallback(tool, transformMSCalendarEvent);
  }
  for (const tool of MS_CALENDAR_EVENT_TOOLS) {
    registerToolOnlyFallback(tool, transformMSCalendarEvent);
  }
  for (const tool of MS_CALENDAR_DELETE_TOOLS) {
    registerToolOnlyFallback(tool, transformMSCalendarDelete);
  }
  registerToolOnlyFallback('list-folder-files', transformListFolderFiles);
  registerToolOnlyFallback('list-todo-task-lists', transformListTodoTaskLists);
  registerToolOnlyFallback('list-todo-tasks', transformListTodoTasks);
}
