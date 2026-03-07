import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { Mail, CheckCircle } from 'lucide-react';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useProgress, useToolApproval } from '~/hooks';
import { parseSendUserEmailOutput } from '~/utils/parseToolOutput';
import ToolResultContainer from './ToolResultContainer';
import ToolApprovalContainer from './ToolApprovalContainer';

type SendUserEmailProps = {
  args: string | Record<string, unknown>;
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
  toolName?: string;
};

type SendUserEmailArgs = {
  subject?: string;
  body?: string;
  html_body?: string;
  from?: string;
};

function parseArgs(args: string | Record<string, unknown>): SendUserEmailArgs {
  try {
    const parsed = typeof args === 'string' ? JSON.parse(args) : args;
    if (!parsed || typeof parsed !== 'object') return {};
    return {
      subject: typeof parsed.subject === 'string' ? parsed.subject : undefined,
      body: typeof parsed.body === 'string' ? parsed.body : undefined,
      html_body: typeof parsed.html_body === 'string' ? parsed.html_body : undefined,
      from: typeof parsed.from === 'string' ? parsed.from : undefined,
    };
  } catch {
    return {};
  }
}

function formatSubmittedAt(iso: string | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso ?? '';
  }
}

export default function SendUserEmail({
  args,
  output,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
  toolName,
}: SendUserEmailProps) {
  const { conversationId, messageId } = useMessageContext();
  const expandedToolCalls = useRecoilValue(store.expandedToolCallsAtom);
  const setExpandedToolCalls = useSetRecoilState(store.expandedToolCallsAtom);
  const [localExpanded, setLocalExpanded] = useState(false);

  const { pendingMatches, approvalStatus, handleApprove, handleDeny, approvalSubmitting, denialReason } =
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
  const parsedOutput = useMemo(() => parseSendUserEmailOutput(output), [output]);
  const outputError = parsedOutput?.error;

  const subject = parsedArgs.subject ?? 'Untitled';
  const toDisplay = parsedOutput?.to;
  const summary =
    isLoading || !hasOutput
      ? `Sending email: ${subject.length > 40 ? `${subject.slice(0, 40)}...` : subject}`
      : outputError
        ? `Failed to send: ${subject.length > 40 ? `${subject.slice(0, 40)}...` : subject}`
        : `Sent email: ${subject.length > 40 ? `${subject.slice(0, 40)}...` : subject}`;

  const hasError = error || cancelled || !!outputError;

  const showApprovalBar = approvalStatus !== null;
  const isPending = approvalStatus === 'pending';

  if (!isLast && !hasOutput && !pendingMatches && !output) {
    return null;
  }

  if (showApprovalBar && isPending) {
    return (
      <ToolApprovalContainer
        onApprove={handleApprove}
        onDeny={handleDeny}
        onToggleExpand={toggleExpand}
        isExpanded={isExpanded}
        isSubmitting={approvalSubmitting}
        toolName={toolName}
      >
        <div className="space-y-2 text-sm">
          <p className="text-text-secondary">
            <span className="font-medium">To:</span> (current user)
          </p>
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
      </ToolApprovalContainer>
    );
  }

  return (
    <ToolResultContainer
      icon={<Mail className="size-5 shrink-0 text-text-secondary" aria-hidden="true" />}
      summary={summary}
      isExpanded={isExpanded}
      onToggle={toggleExpand}
      isLoading={isLoading}
      error={hasError}
      hasExpandableContent={!!parsedArgs.subject || !!parsedArgs.body || hasOutput}
      minExpandHeight={120}
      denialReason={denialReason}
    >
      {outputError ? (
        <p className="text-sm text-red-500">{outputError}</p>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="space-y-2">
            {toDisplay && (
              <p className="text-text-secondary">
                <span className="font-medium">To:</span> {toDisplay}
              </p>
            )}
            <p className="text-text-secondary">
              <span className="font-medium">Subject:</span>{' '}
              <span className="text-text-primary">{subject}</span>
            </p>
            {parsedArgs.body && (
              <div className="mt-2">
                <span className="mb-1 block text-xs font-medium text-text-secondary">Body</span>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border-light bg-surface-tertiary p-3 text-xs text-text-primary whitespace-pre-wrap">
                  {parsedArgs.body.length > 500
                    ? `${parsedArgs.body.slice(0, 500)}...`
                    : parsedArgs.body}
                </div>
              </div>
            )}
          </div>
          {parsedOutput?.success && (
            <div
              className={cn(
                'flex items-start gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2 text-sm text-green-600 dark:text-green-400',
              )}
            >
              <CheckCircle className="size-4 shrink-0 mt-0.5" aria-hidden />
              <div className="min-w-0 flex-1 space-y-0.5">
                <span>Email sent successfully</span>
                {parsedOutput.submittedAt && (
                  <p className="text-xs text-text-secondary">
                    {formatSubmittedAt(parsedOutput.submittedAt)}
                  </p>
                )}
                {parsedOutput.messageId && (
                  <p className="truncate font-mono text-xs text-text-tertiary" title={parsedOutput.messageId}>
                    ID: {parsedOutput.messageId}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </ToolResultContainer>
  );
}
