import { registerToolOnlyFallback } from './registry';
import { stripHtml } from './utils';

type GmailSearchMessage = {
  id?: string;
  threadId?: string;
  subject?: string;
  snippet?: string;
  [key: string]: unknown;
};

type GmailSearchResponse = {
  messages?: GmailSearchMessage[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
  error?: string;
};

type GmailMessageAttachment = {
  filename?: string;
  name?: string;
  size?: number;
  [key: string]: unknown;
};

type GmailGetResponse = {
  id?: string;
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
  body?: string;
  attachments?: GmailMessageAttachment[];
  error?: string;
  [key: string]: unknown;
};

function formatDate(val: unknown): string {
  if (typeof val !== 'string') return '-';
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? String(val) : d.toISOString().split('T')[0];
}

/** Compact JSON for custom UI: m=messages, m[].i=id, m[].t=threadId, m[].s=subject, m[].b=snippet, e=error */
function transformGmailSearch(parsed: unknown): string {
  const data = parsed as GmailSearchResponse;
  if (data?.error) return JSON.stringify({ e: data.error });
  const items = data?.messages ?? [];
  const m = items.map((msg) => {
    const o: { i?: string; t?: string; s?: string; b?: string } = {};
    if (msg?.id) o.i = msg.id;
    if (msg?.threadId) o.t = msg.threadId;
    const subject = msg?.subject ? String(msg.subject).trim() : '';
    if (subject) o.s = subject.slice(0, 80);
    const snippet = msg?.snippet ? String(msg.snippet).trim() : '';
    if (snippet) o.b = snippet.slice(0, 100);
    return o;
  });
  return JSON.stringify({ m });
}

/** Max chars for single-email body (gmail_get). Must match stripHtml + slice. */
const GMAIL_GET_BODY_MAX_LENGTH = 5000;

/** Compact JSON for custom UI: i=id, t=threadId, s=subject, f=from, d=date, b=body/snippet, e=error */
function transformGmailGet(parsed: unknown): string {
  const data = parsed as GmailGetResponse;
  if (data?.error) return JSON.stringify({ e: data.error });
  const o: { i?: string; t?: string; s?: string; f?: string; d?: string; b?: string } = {};
  if (data?.id) o.i = data.id;
  if (data?.threadId) o.t = data.threadId as string;
  if (data?.subject) o.s = String(data.subject).trim();
  if (data?.from) o.f = String(data.from).trim();
  if (data?.date) {
    const d = formatDate(data.date);
    if (d !== '-') o.d = d;
  }
  const rawBody = data?.body ?? data?.snippet ?? '';
  if (rawBody) {
    const bodyText = stripHtml(rawBody as string, { maxLength: GMAIL_GET_BODY_MAX_LENGTH });
    if (bodyText) o.b = bodyText.slice(0, GMAIL_GET_BODY_MAX_LENGTH);
  }
  return JSON.stringify(o);
}

export function registerGmailTransforms(): void {
  registerToolOnlyFallback('gmail_search', transformGmailSearch);
  registerToolOnlyFallback('gmail_get', transformGmailGet);
}
