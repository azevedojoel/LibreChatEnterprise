import { registerToolOnlyFallback } from './registry';
import { stripHtml } from './utils';

type GmailSearchMessage = {
  id?: string;
  threadId?: string;
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

function escapeCell(val: string): string {
  return val.replace(/\|/g, '\\|').trim() || '-';
}

function transformGmailSearch(parsed: unknown): string {
  const data = parsed as GmailSearchResponse;
  if (data?.error) return data.error;
  const items = data?.messages ?? [];
  if (items.length === 0) {
    const suffix = data?.nextPageToken
      ? `\nnextPageToken: ${data.nextPageToken}`
      : '';
    const estimate =
      data?.resultSizeEstimate != null
        ? `\nresultSizeEstimate: ${data.resultSizeEstimate}`
        : '';
    return `(empty)${suffix}${estimate}`;
  }
  const rows = items.map((m) => {
    const id = m?.id ?? '-';
    const threadId = m?.threadId ?? '-';
    return `${id} | ${threadId}`;
  });
  const header = 'id | threadId';
  const sep = '---|--------';
  let body = [header, sep, ...rows].join('\n');
  if (data?.nextPageToken) body += `\nnextPageToken: ${data.nextPageToken}`;
  if (data?.resultSizeEstimate != null)
    body += `\nresultSizeEstimate: ${data.resultSizeEstimate}`;
  return body;
}

function transformGmailGet(parsed: unknown): string {
  const data = parsed as GmailGetResponse;
  if (data?.error) return data.error;
  const parts: string[] = [];
  parts.push(`id: ${data?.id ?? '-'}`);
  parts.push(`subject: ${escapeCell(String(data?.subject ?? '-'))}`);
  parts.push(`from: ${escapeCell(String(data?.from ?? '-'))}`);
  parts.push(`to: ${escapeCell(String(data?.to ?? '-'))}`);
  parts.push(`date: ${formatDate(data?.date ?? '-')}`);
  const rawBody = data?.body ?? '';
  if (rawBody) {
    const bodyText = stripHtml(rawBody, { maxLength: 2000 });
    parts.push(`body: ${escapeCell(bodyText).slice(0, 2000)}`);
  }
  if (data?.attachments?.length) {
    const attList = data.attachments
      .map(
        (a) =>
          `${a?.filename ?? a?.name ?? 'attachment'} (${a?.size ?? '?'} bytes)`,
      )
      .join(', ');
    parts.push(`attachments: ${attList}`);
  }
  return parts.join('\n');
}

export function registerGmailTransforms(): void {
  registerToolOnlyFallback('gmail_search', transformGmailSearch);
  registerToolOnlyFallback('gmail_get', transformGmailGet);
}
