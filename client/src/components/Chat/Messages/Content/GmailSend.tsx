import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { ExternalLink } from 'lucide-react';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useLocalize, useProgress, useToolApproval } from '~/hooks';
import { parseGmailSendOutput } from '~/utils/parseToolOutput';
import ToolResultContainer from './ToolResultContainer';
import ToolApprovalBar from './ToolApprovalBar';
import { cn } from '~/utils';

const GMAIL_ICON = '/assets/google_gmail.svg';

type GmailSendProps = {
  args: string | Record<string, unknown>;
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
  toolName?: string;
};

type GmailSendArgs = {
  to?: string | string[];
  subject?: string;
  body?: string;
  cc?: string | string[];
  bcc?: string | string[];
};

function ensureStringOrStringArray(val: unknown): string | string[] | undefined {
  if (val == null) return undefined;
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) {
    const filtered = val.filter((v): v is string => typeof v === 'string');
    return filtered.length > 0 ? filtered : undefined;
  }
  return undefined;
}

function parseArgs(args: string | Record<string, unknown>): GmailSendArgs {
  try {
    const parsed = typeof args === 'string' ? JSON.parse(args) : args;
    if (!parsed || typeof parsed !== 'object') return {};
    return {
      to: ensureStringOrStringArray(parsed.to),
      subject: typeof parsed.subject === 'string' ? parsed.subject : undefined,
      body: typeof parsed.body === 'string' ? parsed.body : undefined,
      cc: ensureStringOrStringArray(parsed.cc),
      bcc: ensureStringOrStringArray(parsed.bcc),
    };
  } catch {
    return {};
  }
}

function formatTo(to: string | string[] | undefined): string {
  if (!to) return '';
  return Array.isArray(to) ? to.join(', ') : to;
}

const GMAIL_INBOX_URL = 'https://mail.google.com/mail/u/0/#inbox';

export default function GmailSend({
  args,
  output,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
  toolName,
}: GmailSendProps) {
  const localize = useLocalize();
  const { conversationId, messageId } = useMessageContext();
  const expandedToolCalls = useRecoilValue(store.expandedToolCallsAtom);
  const setExpandedToolCalls = useSetRecoilState(store.expandedToolCallsAtom);
  const [localExpanded, setLocalExpanded] = useState(false);

  const { pendingMatches, approvalStatus, handleApprove, handleDeny, approvalSubmitting } =
    useToolApproval(toolCallId, output ?? '');

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

  const parsedArgs = useMemo(() => parseArgs(args), [args]);
  const parsedOutput = useMemo(() => parseGmailSendOutput(output), [output]);
  const outputError = parsedOutput?.error;
  const threadId = parsedOutput?.threadId ?? parsedOutput?.id;

  const subject = parsedArgs.subject ?? 'Untitled';
  const toDisplay = formatTo(parsedArgs.to);
  const summary =
    isLoading || !hasOutput
      ? `Sending email: ${subject.length > 40 ? `${subject.slice(0, 40)}...` : subject}`
      : outputError
        ? `Failed to send: ${subject.length > 40 ? `${subject.slice(0, 40)}...` : subject}`
        : `Sent email: ${subject.length > 40 ? `${subject.slice(0, 40)}...` : subject}`;

  const hasError = error || cancelled || !!outputError;

  const showApprovalBar = approvalStatus !== null;
  const isPending = approvalStatus === 'pending';

  const gmailUrl = threadId
    ? `https://mail.google.com/mail/u/0/#inbox/${threadId}`
    : GMAIL_INBOX_URL;

  if (!isLast && !hasOutput && !pendingMatches && !output) {
    return null;
  }

  if (showApprovalBar && isPending) {
    return (
      <div className="my-2 flex flex-col gap-2">
        <ToolApprovalBar
          onApprove={handleApprove}
          onDeny={handleDeny}
          onToggleExpand={toggleExpand}
          isExpanded={isExpanded}
          isSubmitting={approvalSubmitting}
          toolName={toolName}
        />
        <div
          className={cn(
            'overflow-hidden rounded-lg border border-border-light bg-surface-secondary transition-all duration-300',
            isExpanded ? 'max-h-[400px]' : 'max-h-0',
          )}
        >
          <div className="max-h-[396px] overflow-y-auto border-t border-border-light px-4 py-3">
            <div className="space-y-2 text-sm">
              {toDisplay && (
                <p className="text-text-secondary">
                  <span className="font-medium">To:</span> {toDisplay}
                </p>
              )}
              {subject && (
                <p className="text-text-secondary">
                  <span className="font-medium">Subject:</span> {subject}
                </p>
              )}
              {parsedArgs.body && (
                <p className="mt-2 max-h-48 overflow-y-auto rounded bg-surface-tertiary p-2 text-xs text-text-primary">
                  {parsedArgs.body.length > 500
                    ? `${parsedArgs.body.slice(0, 500)}...`
                    : parsedArgs.body}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ToolResultContainer
      icon={<img src={GMAIL_ICON} alt="" className="size-5 shrink-0" aria-hidden="true" />}
      summary={summary}
      isExpanded={isExpanded}
      onToggle={toggleExpand}
      isLoading={isLoading}
      error={hasError}
      hasExpandableContent={!!parsedArgs.subject || !!parsedArgs.to || hasOutput}
      minExpandHeight={120}
    >
      {outputError ? (
        <p className="text-sm text-red-500">{outputError}</p>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-text-secondary">-</span>
            <span className="min-w-0 flex-1 truncate font-medium text-text-primary">{subject}</span>
            <a
              href={gmailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
              title={subject}
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              {localize('com_ui_gmail_open')}
            </a>
          </div>
          {toDisplay && (
            <p className="text-xs text-text-secondary">
              <span className="font-medium">To:</span> {toDisplay}
            </p>
          )}
        </div>
      )}
    </ToolResultContainer>
  );
}
