import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { ExternalLink } from 'lucide-react';
import { dataService } from 'librechat-data-provider';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useLocalize, useToolApproval } from '~/hooks';
import { openOAuthUrl } from '~/utils/openOAuthUrl';
import ToolResultContainer from './ToolResultContainer';
import ToolApprovalContainer from './ToolApprovalContainer';
import FinishedIcon from './FinishedIcon';
import { getToolDisplayName } from '~/utils/toolDisplayNames';

type AddProductivityAccountProps = {
  args: string | Record<string, unknown>;
  output?: string | null;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
  name?: string;
};

type ParsedOutput = {
  oauthUrl?: string;
  connectUrl?: string;
  provider?: string;
  message?: string;
  error?: string;
};

function parseOutput(output: string | null | undefined): ParsedOutput | null {
  if (!output || output.trim() === '') return null;
  try {
    const parsed = JSON.parse(output);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function AddProductivityAccount({
  args,
  output,
  isSubmitting,
  isLast,
  toolCallId,
  name,
}: AddProductivityAccountProps) {
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

  const parsedOutput = useMemo(() => parseOutput(output ?? ''), [output]);
  const hasOutput = output != null && output !== '';
  const oauthUrl = parsedOutput?.oauthUrl && typeof parsedOutput.oauthUrl === 'string'
    ? parsedOutput.oauthUrl
    : null;
  const connectUrl = parsedOutput?.connectUrl && typeof parsedOutput.connectUrl === 'string'
    ? parsedOutput.connectUrl
    : null;
  const urlToOpen = connectUrl ?? oauthUrl;
  const provider = parsedOutput?.provider;
  const message = parsedOutput?.message;
  const error = parsedOutput?.error;
  const isLoading = isSubmitting && !hasOutput;

  const showApprovalBar = approvalStatus !== null;
  const isPending = approvalStatus === 'pending';

  const toolDisplayName = name ? getToolDisplayName(name) : 'Productivity Account';

  const summary =
    isLoading
      ? `${toolDisplayName}: Waiting for approval...`
      : error
        ? `${toolDisplayName}: ${error}`
        : urlToOpen
          ? `${toolDisplayName}: Open link to sign in`
          : message
            ? `${toolDisplayName}: ${message.slice(0, 60)}${message.length > 60 ? '...' : ''}`
            : `${toolDisplayName}: Completed`;

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
        toolName={name}
      >
        <div className="space-y-2 text-sm text-text-secondary">
          <p>
            This will initiate OAuth to add or re-authenticate a productivity account (Google or
            Microsoft). After approval, you will receive a link to sign in.
          </p>
        </div>
      </ToolApprovalContainer>
    );
  }

  return (
    <ToolResultContainer
      icon={<FinishedIcon />}
      summary={summary}
      isExpanded={isExpanded}
      onToggle={toggleExpand}
      isLoading={isLoading}
      error={!!error}
      hasExpandableContent={!!message || !!urlToOpen || !!error}
      minExpandHeight={80}
      denialReason={denialReason}
    >
      {error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : (
        <div className="space-y-2 text-sm">
          {message && <p className="text-text-primary">{message}</p>}
          {urlToOpen && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={async () => {
                  const serverName = provider === 'google' ? 'Google' : provider === 'microsoft' ? 'Microsoft' : null;
                  if (serverName) {
                    try {
                      await dataService.bindMCPOAuth(serverName);
                    } catch {
                      // Allow click anyway; callback may fail without CSRF cookie
                    }
                  }
                  openOAuthUrl(urlToOpen);
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
              >
                <ExternalLink className="size-3.5" aria-hidden="true" />
                {localize('com_ui_connect')}
              </button>
            </div>
          )}
        </div>
      )}
    </ToolResultContainer>
  );
}
