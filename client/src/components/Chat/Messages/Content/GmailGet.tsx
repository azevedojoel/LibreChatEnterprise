import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { ExternalLink } from 'lucide-react';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useProgress } from '~/hooks';
import ToolResultContainer from './ToolResultContainer';
const GMAIL_ICON = '/assets/google_gmail.svg';

type GmailGetProps = {
  args: string | Record<string, unknown>;
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
};

type GmailGetOutput = {
  id?: string;
  threadId?: string;
  subject?: string;
  from?: string;
  date?: string;
  snippet?: string;
  error?: string;
};

/** Compact JSON from API: i=id, t=threadId, s=subject, f=from, d=date, b=body/snippet, e=error. Plain string = error (formatter short-circuit). */
function parseOutput(output: string | null | undefined): GmailGetOutput | null {
  if (!output || typeof output !== 'string') return null;
  const trimmed = output.trim();
  try {
    // Backwards compat: if output is content-array stringified, extract inner text
    if (trimmed.startsWith('[')) {
      const arr = JSON.parse(trimmed) as unknown[];
      const first = arr?.[0];
      const inner =
        typeof first === 'string'
          ? first
          : first && typeof first === 'object' && 'text' in first && typeof (first as { text?: string }).text === 'string'
            ? (first as { text: string }).text
            : null;
      if (inner) return parseOutput(inner);
    }
    if (!trimmed.startsWith('{')) {
      return trimmed ? { error: trimmed } : null;
    }
    const parsed = JSON.parse(trimmed) as {
      i?: string;
      t?: string;
      s?: string;
      f?: string;
      d?: string;
      b?: string;
      e?: string;
    };
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.e) return { error: parsed.e };
    return {
      id: parsed.i,
      threadId: parsed.t,
      subject: parsed.s,
      from: parsed.f,
      date: parsed.d,
      snippet: parsed.b,
    };
  } catch {
    return trimmed ? { error: trimmed } : null;
  }
}

const GMAIL_MESSAGE_URL = 'https://mail.google.com/mail/u/0/#inbox';

export default function GmailGet({
  args,
  output,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
}: GmailGetProps) {
  const { conversationId, messageId } = useMessageContext();
  const expandedToolCalls = useRecoilValue(store.expandedToolCallsAtom);
  const setExpandedToolCalls = useSetRecoilState(store.expandedToolCallsAtom);
  const [localExpanded, setLocalExpanded] = useState(false);

  const expandedKey =
    conversationId && messageId && toolCallId
      ? `${conversationId}:${messageId}:${toolCallId}`
      : null;

  const isExpanded = expandedKey
    ? expandedToolCalls.has(expandedKey)
    : localExpanded;

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

  const parsed = useMemo(() => parseOutput(output), [output]);

  const subject = parsed?.subject ?? parsed?.snippet ?? 'Email';
  const gmailError = parsed?.error;
  const threadId = parsed?.threadId ?? parsed?.id;
  const url = threadId ? `${GMAIL_MESSAGE_URL}/${threadId}` : null;

  const summary = subject && subject !== 'Email'
    ? `Retrieved email: ${subject.length > 50 ? `${subject.slice(0, 50)}...` : subject}`
    : 'Retrieved email';

  const hasError = error || cancelled || !!gmailError;

  if (!isLast && !hasOutput && !output) {
    return null;
  }

  return (
    <ToolResultContainer
      icon={<img src={GMAIL_ICON} alt="" className="size-5 shrink-0" aria-hidden="true" />}
      summary={summary}
      isExpanded={isExpanded}
      onToggle={toggleExpand}
      isLoading={isLoading}
      error={hasError}
      hasExpandableContent={hasOutput}
    >
      {gmailError ? (
        <p className="text-sm text-red-500">{gmailError}</p>
      ) : (
        <div className="space-y-0.5 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-text-secondary">-</span>
            <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
              {subject}
            </span>
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
                title={subject}
              >
                <ExternalLink className="size-3.5" aria-hidden="true" />
                Open
              </a>
            )}
          </div>
          {parsed?.from && (
            <div className="pl-4 text-text-secondary">
              From: {parsed.from}
            </div>
          )}
          {parsed?.date && (
            <div className="pl-4 text-text-secondary">
              Date: {parsed.date}
            </div>
          )}
          {parsed?.snippet && parsed.snippet !== subject && (
            <div className="pl-4 line-clamp-2 text-text-secondary">
              {parsed.snippet}
            </div>
          )}
        </div>
      )}
    </ToolResultContainer>
  );
}
