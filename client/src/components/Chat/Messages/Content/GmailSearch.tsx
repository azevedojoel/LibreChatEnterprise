import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { ExternalLink } from 'lucide-react';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useProgress } from '~/hooks';
import ToolResultContainer from './ToolResultContainer';
const GMAIL_ICON = '/assets/google_gmail.svg';

type GmailSearchProps = {
  args: string | Record<string, unknown>;
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
};

type GmailMessage = {
  id?: string;
  threadId?: string;
  subject?: string;
  snippet?: string;
};

/** Compact JSON from API: m=messages, m[].i=id, m[].t=threadId, m[].s=subject, m[].b=snippet, e=error. */
function parseOutput(output: string | null | undefined): {
  messages: GmailMessage[];
  error?: string;
} | null {
  if (!output || typeof output !== 'string') return null;
  const trimmed = output.trim();
  try {
    // Backwards compat: if output is content-array stringified, extract inner text
    if (trimmed.startsWith('[')) {
      const arr = JSON.parse(trimmed) as unknown[];
      const first = arr?.[0];
      let inner: string | null = null;
      if (typeof first === 'string') {
        inner = first;
      } else if (
        first &&
        typeof first === 'object' &&
        'text' in first &&
        typeof (first as { text?: string }).text === 'string'
      ) {
        inner = (first as { text: string }).text;
      }
      if (inner) return parseOutput(inner);
    }
    if (!trimmed.startsWith('{')) {
      return trimmed ? { messages: [], error: trimmed } : null;
    }
    const parsed = JSON.parse(trimmed) as {
      m?: Array<{ i?: string; t?: string; s?: string; b?: string }>;
      e?: string;
    };
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.e) return { messages: [], error: parsed.e };
    const m = parsed.m;
    const messages: GmailMessage[] = Array.isArray(m)
      ? m.map((item) => ({
          id: item?.i,
          threadId: item?.t,
          subject: item?.s,
          snippet: item?.b,
        }))
      : [];
    return { messages };
  } catch {
    return trimmed ? { messages: [], error: trimmed } : null;
  }
}

function getMessageLabel(msg: GmailMessage): string {
  if (msg.subject) return msg.subject;
  if (msg.snippet) return msg.snippet;
  if (msg.id) return `Email (${msg.id.slice(0, 8)}...)`;
  return 'Email';
}

function parseQuery(args: string | Record<string, unknown>): string {
  try {
    const parsed = typeof args === 'string' ? JSON.parse(args) : args;
    const query = parsed?.query;
    return typeof query === 'string' ? query : '';
  } catch {
    return '';
  }
}

const GMAIL_MESSAGE_URL = 'https://mail.google.com/mail/u/0/#inbox';

export default function GmailSearch({
  args,
  output,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
}: GmailSearchProps) {
  const { conversationId, messageId } = useMessageContext();
  const expandedToolCalls = useRecoilValue(store.expandedToolCallsAtom);
  const setExpandedToolCalls = useSetRecoilState(store.expandedToolCallsAtom);
  const [localExpanded, setLocalExpanded] = useState(false);

  const expandedKey =
    conversationId && messageId && toolCallId
      ? `${conversationId}:${messageId}:${toolCallId}`
      : null;

  const isExpanded = expandedKey ? expandedToolCalls.has(expandedKey) : localExpanded;

  const toggleExpand = useCallback(() => {
    if (expandedKey) {
      setExpandedToolCalls((prev) => {
        const next = new Set(prev);
        if (next.has(expandedKey)) next.delete(expandedKey);
        else next.add(expandedKey);
        return next;
      });
    } else {
      setLocalExpanded((prev) => !prev);
    }
  }, [expandedKey, setExpandedToolCalls]);

  const progress = useProgress(initialProgress);
  const hasOutput = output != null && output !== '';
  const error =
    typeof output === 'string' && output.toLowerCase().includes('error processing tool');
  const cancelled = !hasOutput && !isSubmitting && progress < 1;
  const isLoading = isSubmitting && !hasOutput;

  const query = useMemo(() => parseQuery(args), [args]);
  const parsed = useMemo(() => parseOutput(output), [output]);

  const messages = parsed?.messages ?? [];
  const gmailError = parsed?.error;
  const resultsCount = messages.length;

  const summary = query ? `Searched Gmail: ${query}` : 'Searched Gmail';

  const hasError = error || cancelled || !!gmailError;
  const showResultsCount = hasOutput && !gmailError;

  if (!isLast && !hasOutput && !output) {
    return null;
  }

  return (
    <ToolResultContainer
      icon={<img src={GMAIL_ICON} alt="" className="size-5 shrink-0" aria-hidden="true" />}
      summary={summary}
      resultsCount={showResultsCount ? resultsCount : undefined}
      isExpanded={isExpanded}
      onToggle={toggleExpand}
      isLoading={isLoading}
      error={hasError}
      hasExpandableContent={hasOutput}
    >
      {gmailError ? (
        <p className="text-sm text-red-500">{gmailError}</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {messages.map((msg, idx) => {
            const threadId = msg.threadId ?? msg.id;
            const url = threadId ? `${GMAIL_MESSAGE_URL}/${threadId}` : null;
            const primary = getMessageLabel(msg);
            const trimmedSnippet = msg.snippet?.trim() ?? '';
            const showSnippet = msg.subject && trimmedSnippet.length > 0;
            const snippetPreview = showSnippet
              ? trimmedSnippet.slice(0, 60) + (trimmedSnippet.length > 60 ? '…' : '')
              : null;
            return (
              <li key={msg.id ?? msg.threadId ?? idx} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-text-secondary">-</span>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-text-primary">{primary}</span>
                  {snippetPreview && (
                    <span className="mt-0.5 block truncate text-xs text-text-secondary">
                      {snippetPreview}
                    </span>
                  )}
                </div>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
                    title={primary}
                  >
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ToolResultContainer>
  );
}
