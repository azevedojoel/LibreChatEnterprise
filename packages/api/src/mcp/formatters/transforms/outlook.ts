import { registerTransform, registerToolOnlyFallback } from './registry';
import { stripHtml } from './utils';

type ODataValueResponse<T> = {
  value?: T[];
  '@odata.nextLink'?: string;
  error?: { message?: string };
};

type GraphMessageListItem = {
  id?: string;
  subject?: string;
  sender?: { emailAddress?: { name?: string; address?: string } };
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime?: string;
  [key: string]: unknown;
};

type GraphMessage = GraphMessageListItem & {
  body?: { contentType?: string; content?: string };
  bodyPreview?: string;
  toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  hasAttachments?: boolean;
  attachments?: Array<{ name?: string; size?: number }>;
};

function formatDate(val: unknown): string {
  if (typeof val !== 'string') return '-';
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? String(val) : d.toISOString().split('T')[0];
}

function escapeCell(val: string): string {
  return val.replace(/\|/g, '\\|').trim() || '-';
}

function extractEmailAddress(obj: { emailAddress?: { address?: string; name?: string } } | undefined): string {
  if (!obj?.emailAddress?.address) return '-';
  return obj.emailAddress.address;
}

function transformListMailMessages(parsed: unknown): string {
  const data = parsed as ODataValueResponse<GraphMessageListItem>;
  if (data?.error?.message) return data.error.message;
  const items = data?.value ?? [];
  if (items.length === 0) {
    const suffix = data?.['@odata.nextLink']
      ? `\n@odata.nextLink: (has more)`
      : '';
    return `(empty)${suffix}`;
  }
  const rows = items.map((m) => {
    const id = m?.id ?? '-';
    const subject = escapeCell(String(m?.subject ?? '-'));
    const from = escapeCell(extractEmailAddress(m?.sender ?? m?.from));
    const date = formatDate(m?.receivedDateTime);
    return `${id} | ${subject} | ${from} | ${date}`;
  });
  const header = 'id | subject | from | receivedDateTime';
  const sep = '---|--------|------|-----------------';
  let body = [header, sep, ...rows].join('\n');
  if (data?.['@odata.nextLink']) body += '\n@odata.nextLink: (has more)';
  return body;
}

function transformGetMailMessage(parsed: unknown): string {
  const data = parsed as GraphMessage & { error?: { message?: string } };
  if (data?.error) {
    const msg = typeof data.error === 'string' ? data.error : data.error?.message;
    return msg ?? 'Unknown error';
  }
  const parts: string[] = [];
  parts.push(`id: ${data?.id ?? '-'}`);
  parts.push(`subject: ${escapeCell(String(data?.subject ?? '-'))}`);
  parts.push(`from: ${escapeCell(extractEmailAddress(data?.sender ?? data?.from))}`);
  const toStr = (data?.toRecipients ?? [])
    .map((r) => extractEmailAddress(r))
    .filter(Boolean)
    .join(', ');
  parts.push(`to: ${escapeCell(toStr || '-')}`);
  parts.push(`receivedDateTime: ${formatDate(data?.receivedDateTime ?? '-')}`);
  if (data?.bodyPreview) parts.push(`bodyPreview: ${escapeCell(data.bodyPreview).slice(0, 500)}`);
  const rawBody = data?.body?.content ?? '';
  if (rawBody) {
    const isHtml = data?.body?.contentType === 'html';
    const bodyText = isHtml ? stripHtml(rawBody, { maxLength: 2000 }) : rawBody;
    parts.push(`body: ${escapeCell(bodyText).slice(0, 2000)}`);
  }
  if (data?.hasAttachments && data?.attachments?.length) {
    const attList = data.attachments
      .map((a) => `${a?.name ?? 'attachment'} (${a?.size ?? '?'} bytes)`)
      .join(', ');
    parts.push(`attachments: ${attList}`);
  }
  return parts.join('\n');
}

const MICROSOFT_SERVER_ALIASES = ['Microsoft', 'Microsoft 365', 'ms365', 'ms-365'];

const LIST_MAIL_TOOLS = [
  'list-mail-messages',
  'list-mail-folder-messages',
  'list-shared-mailbox-messages',
];
const GET_MAIL_TOOLS = ['get-mail-message', 'get-shared-mailbox-message'];

export function registerOutlookTransforms(): void {
  for (const server of MICROSOFT_SERVER_ALIASES) {
    for (const tool of LIST_MAIL_TOOLS) {
      registerTransform(server, tool, transformListMailMessages);
    }
    for (const tool of GET_MAIL_TOOLS) {
      registerTransform(server, tool, transformGetMailMessage);
    }
  }
  for (const tool of LIST_MAIL_TOOLS) {
    registerToolOnlyFallback(tool, transformListMailMessages);
  }
  for (const tool of GET_MAIL_TOOLS) {
    registerToolOnlyFallback(tool, transformGetMailMessage);
  }
}
