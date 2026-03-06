/**
 * Parse helpers for Calendar and CRM tool output.
 * Handles both raw JSON from MCP and content-array format.
 */

/** Extract inner text from content-array format */
function extractText(output: string | null | undefined): string | null {
  if (!output || typeof output !== 'string') return null;
  const trimmed = output.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith('[')) {
      const arr = JSON.parse(trimmed) as unknown[];
      const first = arr?.[0];
      if (typeof first === 'string') return first;
      if (
        first &&
        typeof first === 'object' &&
        'text' in first &&
        typeof (first as { text?: string }).text === 'string'
      ) {
        return (first as { text: string }).text;
      }
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

/** Google Calendar item: { id, summary } */
export type GoogleCalendarItem = { id?: string; summary?: string };

/** Google Calendar event: { id, summary, start, end, ... } */
export type GoogleCalendarEvent = {
  id?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  description?: string;
  htmlLink?: string;
  location?: string;
};

/** Google free time slot */
export type GoogleFreeTimeSlot = { start?: string; end?: string };

export function parseCalendarListOutput(output: string | null | undefined): {
  calendars: GoogleCalendarItem[];
  error?: string;
} | null {
  const text = extractText(output);
  if (!text || !text.startsWith('{')) return text ? { calendars: [], error: text } : null;
  try {
    const parsed = JSON.parse(text) as { c?: Array<{ i?: string; s?: string }>; e?: string };
    if (parsed.e) return { calendars: [], error: parsed.e };
    const c = parsed.c ?? [];
    const calendars = (Array.isArray(c) ? c : []).map((item) => ({
      id: item?.i,
      summary: item?.s ?? 'Unnamed',
    }));
    return { calendars };
  } catch {
    return text ? { calendars: [], error: text } : null;
  }
}

export function parseCalendarListEventsOutput(output: string | null | undefined): {
  events: GoogleCalendarEvent[];
  error?: string;
} | null {
  const text = extractText(output);
  if (!text || !text.startsWith('{')) return text ? { events: [], error: text } : null;
  try {
    const parsed = JSON.parse(text) as {
      ev?: Array<{ i?: string; s?: string; st?: unknown; en?: unknown; d?: string; h?: string; l?: string }>;
      e?: string;
    };
    if (parsed.e) return { events: [], error: parsed.e };
    const ev = parsed.ev ?? [];
    const events = (Array.isArray(ev) ? ev : []).map((item) => ({
      id: item?.i,
      summary: item?.s ?? 'Untitled',
      start: item?.st,
      end: item?.en,
      description: item?.d,
      htmlLink: item?.h,
      location: item?.l,
    }));
    return { events };
  } catch {
    return text ? { events: [], error: text } : null;
  }
}

export function parseCalendarEventOutput(output: string | null | undefined): {
  event: GoogleCalendarEvent | null;
  error?: string;
} | null {
  const text = extractText(output);
  if (!text || !text.startsWith('{')) return text ? { event: null, error: text } : null;
  try {
    const parsed = JSON.parse(text) as {
      i?: string;
      s?: string;
      st?: unknown;
      en?: unknown;
      d?: string;
      h?: string;
      l?: string;
      e?: string;
    };
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.e) return { event: null, error: parsed.e };
    return {
      event: {
        id: parsed.i,
        summary: parsed.s ?? 'Untitled',
        start: parsed.st,
        end: parsed.en,
        description: parsed.d,
        htmlLink: parsed.h,
        location: parsed.l,
      },
    };
  } catch {
    return text ? { event: null, error: text } : null;
  }
}

export function parseCalendarRespondOutput(output: string | null | undefined): {
  summary?: string;
  responseStatus?: string;
  message?: string;
  error?: string;
} | null {
  const text = extractText(output);
  if (!text || !text.startsWith('{')) return text ? { error: text } : null;
  try {
    const parsed = JSON.parse(text) as { i?: string; s?: string; r?: string; m?: string; e?: string };
    if (parsed.e) return { error: parsed.e };
    return {
      summary: parsed.s,
      responseStatus: parsed.r,
      message: parsed.m,
    };
  } catch {
    return text ? { error: text } : null;
  }
}

export function parseCalendarFindFreeTimeOutput(output: string | null | undefined): {
  slots: GoogleFreeTimeSlot[];
  error?: string;
} | null {
  const text = extractText(output);
  if (!text || !text.startsWith('{')) return text ? { slots: [], error: text } : null;
  try {
    const parsed = JSON.parse(text) as {
      st?: string;
      en?: string;
      sl?: Array<{ st?: string; en?: string }>;
      e?: string;
    };
    if (parsed.e) return { slots: [], error: parsed.e };
    if (parsed.st && parsed.en) return { slots: [{ start: parsed.st, end: parsed.en }] };
    const sl = parsed.sl ?? [];
    const slots = (Array.isArray(sl) ? sl : []).map((item) => ({
      start: item?.st,
      end: item?.en,
    }));
    return { slots };
  } catch {
    return text ? { slots: [], error: text } : null;
  }
}

export function parseCalendarDeleteOutput(output: string | null | undefined): {
  success: boolean;
  error?: string;
} | null {
  const text = extractText(output);
  if (!text || !text.startsWith('{')) return text ? { success: false, error: text } : null;
  try {
    const parsed = JSON.parse(text) as { ok?: boolean; e?: string };
    if (parsed.e) return { success: false, error: parsed.e };
    return { success: parsed.ok === true };
  } catch {
    return text ? { success: false, error: text } : null;
  }
}

// --- MS 365 Calendar (compact JSON format) ---

export type MSEvent = {
  id?: string;
  subject?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  bodyPreview?: string;
  webLink?: string;
  location?: { displayName?: string };
};

type MSCompactEvent = { i?: string; s?: string; st?: unknown; en?: unknown; d?: string; h?: string; l?: string };

export function parseMSCalendarOutput(output: string | null | undefined): {
  events: MSEvent[];
  error?: string;
} | null {
  const text = extractText(output);
  if (!text || !text.startsWith('{')) return text ? { events: [], error: text } : null;
  try {
    const parsed = JSON.parse(text) as { ev?: MSCompactEvent[]; e?: string };
    if (parsed.e) return { events: [], error: parsed.e };
    const ev = parsed.ev ?? [];
    const events = (Array.isArray(ev) ? ev : []).map((item) => ({
      id: item?.i,
      subject: item?.s ?? 'Untitled',
      start: item?.st as MSEvent['start'],
      end: item?.en as MSEvent['end'],
      webLink: item?.h,
      location: item?.l ? { displayName: item.l } : undefined,
    }));
    return { events };
  } catch {
    return text ? { events: [], error: text } : null;
  }
}

export function parseMSCalendarEventOutput(output: string | null | undefined): {
  event: MSEvent | null;
  error?: string;
} | null {
  const text = extractText(output);
  if (!text || !text.startsWith('{')) return text ? { event: null, error: text } : null;
  try {
    const parsed = JSON.parse(text) as MSCompactEvent & { e?: string };
    if (parsed.e) return { event: null, error: parsed.e };
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      event: {
        id: parsed.i,
        subject: parsed.s ?? 'Untitled',
        start: parsed.st as MSEvent['start'],
        end: parsed.en as MSEvent['end'],
        bodyPreview: parsed.d,
        webLink: parsed.h,
        location: parsed.l ? { displayName: parsed.l } : undefined,
      },
    };
  } catch {
    return text ? { event: null, error: text } : null;
  }
}

export function parseMSCalendarDeleteOutput(output: string | null | undefined): {
  success: boolean;
  error?: string;
} | null {
  return parseCalendarDeleteOutput(output);
}

// --- CRM ---

export type CRMPipeline = { id?: string; name?: string };
export type CRMContact = { id?: string; name?: string; email?: string };
export type CRMOrganization = { id?: string; name?: string };
export type CRMDeal = { id?: string; name?: string; amount?: number; stage?: string };
export type CRMActivity = { id?: string; summary?: string; type?: string };

export function parseCRMListOutput<T extends { id?: string; name?: string }>(
  output: string | null | undefined,
  keyName: string,
): { items: T[]; error?: string } | null {
  const text = extractText(output);
  if (!text) return null;
  try {
    if (text.startsWith('{') && text.includes('"error"')) {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) return { items: [], error: parsed.error };
    }
    if (!text.startsWith('[') && !text.startsWith('{')) {
      return text ? { items: [], error: text } : null;
    }
    const parsed = JSON.parse(text);
    if (parsed.error) return { items: [], error: parsed.error };
    const arr = Array.isArray(parsed) ? parsed : parsed[keyName] ?? parsed.items ?? [];
    const items = arr.map((item: Record<string, unknown>) => ({
      id: item?.id,
      name: item?.name ?? item?.title ?? item?.summary ?? 'Unnamed',
      ...item,
    })) as T[];
    return { items };
  } catch {
    return text ? { items: [], error: text } : null;
  }
}

export function parseCRMListOutputGeneric(
  output: string | null | undefined,
  keys: string[],
): { items: Record<string, unknown>[]; error?: string } | null {
  const text = extractText(output);
  if (!text) return null;
  try {
    if (text.startsWith('{') && text.includes('"error"')) {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) return { items: [], error: parsed.error };
    }
    if (!text.startsWith('[') && !text.startsWith('{')) {
      return text ? { items: [], error: text } : null;
    }
    const parsed = JSON.parse(text);
    if (parsed?.error) return { items: [], error: parsed.error };
    let arr: unknown[] = [];
    if (Array.isArray(parsed)) {
      arr = parsed;
    } else if (parsed && typeof parsed === 'object') {
      for (const k of keys) {
        const val = (parsed as Record<string, unknown>)[k];
        if (Array.isArray(val)) {
          arr = val;
          break;
        }
      }
    }
    const items = (Array.isArray(arr) ? arr : []).map((item) =>
      typeof item === 'object' && item ? { ...(item as Record<string, unknown>) } : {},
    ) as Record<string, unknown>[];
    return { items };
  } catch {
    return text ? { items: [], error: text } : null;
  }
}

export function parseCRMSingleOutput(
  output: string | null | undefined,
): { item: Record<string, unknown> | null; error?: string } | null {
  const text = extractText(output);
  if (!text) return null;
  try {
    if (text.startsWith('{') && text.includes('"error"')) {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) return { item: null, error: parsed.error };
    }
    if (!text.startsWith('{')) {
      return text ? { item: null, error: text } : null;
    }
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.error) return { item: null, error: String(parsed.error) };
    return { item: parsed };
  } catch {
    return text ? { item: null, error: text } : null;
  }
}

export function parseCRMDeleteOutput(output: string | null | undefined): {
  success: boolean;
  error?: string;
} | null {
  const text = extractText(output);
  if (!text) return null;
  try {
    if (text.startsWith('{') && text.includes('"error"')) {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) return { success: false, error: parsed.error };
    }
    if (text.toLowerCase().includes('error')) return { success: false, error: text };
    if (/successfully deleted|deleted successfully|soft.?deleted/i.test(text)) return { success: true };
    return { success: true };
  } catch {
    return text ? { success: false, error: text } : null;
  }
}

// --- Drive & Gmail tool output (shared parse logic) ---

/** Extract key-value pairs from text like "id: xxx name: yyy" */
function extractKeyValues(
  text: string,
  keys: { regex: RegExp; name: string }[],
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const { regex, name } of keys) {
    const m = text.match(regex);
    if (m?.[1]) result[name] = m[1].trim();
  }
  return result;
}

export type DriveCreateFolderOutput = { id?: string; name?: string; error?: string };

export function parseDriveCreateFolderOutput(
  output: string | null | undefined,
): DriveCreateFolderOutput | null {
  const text = extractText(output);
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed) as { id?: string; name?: string; error?: string };
      if (!parsed || typeof parsed !== 'object') return null;
      if (parsed.error) return { error: parsed.error };
      return { id: parsed.id, name: parsed.name };
    }
    const kv = extractKeyValues(trimmed, [
      { regex: /\bid\s*[=:]\s*["']?([A-Za-z0-9_-]+)["']?/i, name: 'id' },
      { regex: /\bname\s*[=:]\s*["']?([^"'\n]+)["']?/i, name: 'name' },
    ]);
    if (kv.id || kv.name) return { id: kv.id, name: kv.name };
    return trimmed ? { error: trimmed } : null;
  } catch {
    const kv = extractKeyValues(trimmed, [
      { regex: /\bid\s*[=:]\s*["']?([A-Za-z0-9_-]+)["']?/i, name: 'id' },
      { regex: /\bname\s*[=:]\s*["']?([^"'\n]+)["']?/i, name: 'name' },
    ]);
    if (kv.id || kv.name) return { id: kv.id, name: kv.name };
    return trimmed ? { error: trimmed } : null;
  }
}

export type GmailSendOutput = { id?: string; threadId?: string; status?: string; error?: string };

export function parseGmailSendOutput(output: string | null | undefined): GmailSendOutput | null {
  const text = extractText(output);
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed) as {
        id?: string;
        threadId?: string;
        status?: string;
        error?: string;
      };
      if (!parsed || typeof parsed !== 'object') return null;
      if (parsed.error) return { error: parsed.error };
      return {
        id: parsed.id,
        threadId: parsed.threadId,
        status: parsed.status,
      };
    }
    const kv = extractKeyValues(trimmed, [
      { regex: /\bid\s*[=:]\s*["']?([A-Za-z0-9_-]+)["']?/i, name: 'id' },
      { regex: /\bthreadId\s*[=:]\s*["']?([A-Za-z0-9_-]+)["']?/i, name: 'threadId' },
      { regex: /\bstatus\s*[=:]\s*["']?(\w+)["']?/i, name: 'status' },
    ]);
    const { id, threadId, status } = kv;
    if (status === 'sent' || (id && threadId)) {
      return { id, threadId, status: status ?? undefined };
    }
    return trimmed ? { error: trimmed } : null;
  } catch {
    const kv = extractKeyValues(trimmed, [
      { regex: /\bid\s*[=:]\s*["']?([A-Za-z0-9_-]+)["']?/i, name: 'id' },
      { regex: /\bthreadId\s*[=:]\s*["']?([A-Za-z0-9_-]+)["']?/i, name: 'threadId' },
      { regex: /\bstatus\s*[=:]\s*["']?(\w+)["']?/i, name: 'status' },
    ]);
    const { id, threadId, status } = kv;
    if (status === 'sent' || (id && threadId)) {
      return { id, threadId, status: status ?? undefined };
    }
    return trimmed ? { error: trimmed } : null;
  }
}

export type SendUserEmailOutput = {
  success?: boolean;
  messageId?: string;
  submittedAt?: string;
  to?: string;
  error?: string;
};

export function parseSendUserEmailOutput(
  output: string | null | undefined,
): SendUserEmailOutput | null {
  const text = extractText(output);
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed) as {
        success?: boolean;
        messageId?: string;
        submittedAt?: string;
        to?: string;
        error?: string;
      };
      if (!parsed || typeof parsed !== 'object') return null;
      if (parsed.error) return { error: parsed.error };
      if (typeof parsed.success === 'boolean' && parsed.success) {
        return {
          success: parsed.success,
          messageId: parsed.messageId,
          submittedAt: parsed.submittedAt,
          to: parsed.to,
        };
      }
      return null;
    }
    if (trimmed.toLowerCase().startsWith('error:')) {
      return { error: trimmed.replace(/^error:\s*/i, '') };
    }
    return trimmed ? { error: trimmed } : null;
  } catch {
    return trimmed ? { error: trimmed } : null;
  }
}
