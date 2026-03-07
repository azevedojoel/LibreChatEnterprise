import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { ExternalLink } from 'lucide-react';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useLocalize, useProgress, useToolApproval } from '~/hooks';
import { parseGmailSendOutput } from '~/utils/parseToolOutput';
import ToolResultContainer from './ToolResultContainer';
import ToolApprovalContainer from './ToolApprovalContainer';

const GMAIL_ICON = '/assets/google_gmail.svg';

type GmailSendDraftProps = {
  args: string | Record<string, unknown>;
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
  toolName?: string;
};

const GMAIL_INBOX_URL = 'https://mail.google.com/mail/u/0/#inbox';

function parseArgs(args: string | Record<string, unknown>): { draftId?: string } {
  try {
    const parsed = typeof args === 'string' ? JSON.parse(args) : args;
    if (!parsed || typeof parsed !== 'object') return {};
    return { draftId: typeof parsed.draftId === 'string' ? parsed.draftId : undefined };
  } catch {
    return {};
  }
}

export default function GmailSendDraft({
  args,
  output,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
  toolName,
}: GmailSendDraftProps) {
  const localize = useLocalize();
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

  const parsedOutput = useMemo(() => parseGmailSendOutput(output), [output]);
  const outputError = parsedOutput?.error;
  const threadId = parsedOutput?.threadId ?? parsedOutput?.id;

  const summary =
    isLoading || !hasOutput
      ? 'Sending draft...'
      : outputError
        ? 'Failed to send draft'
        : 'Sent draft';

  const hasError = error || cancelled || !!outputError;

  const gmailUrl = threadId
    ? `https://mail.google.com/mail/u/0/#inbox/${threadId}`
    : GMAIL_INBOX_URL;

  const parsedArgs = useMemo(() => parseArgs(args), [args]);
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
            Sending draft{parsedArgs.draftId ? ` (ID: ${parsedArgs.draftId})` : ''}
          </p>
        </div>
      </ToolApprovalContainer>
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
      hasExpandableContent={!!parsedOutput?.id || !!parsedOutput?.threadId || hasOutput}
      minExpandHeight={80}
      denialReason={denialReason}
    >
      {outputError ? (
        <p className="text-sm text-red-500">{outputError}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-text-secondary">-</span>
          <span className="min-w-0 flex-1 text-text-primary">Draft sent successfully</span>
          <a
            href={gmailUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            {localize('com_ui_gmail_open')}
          </a>
        </div>
      )}
    </ToolResultContainer>
  );
}
