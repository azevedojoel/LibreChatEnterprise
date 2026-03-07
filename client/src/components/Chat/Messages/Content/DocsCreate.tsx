import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { ExternalLink } from 'lucide-react';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useProgress, useToolApproval } from '~/hooks';
import useOpenInArtifact from '~/hooks/Artifacts/useOpenInArtifact';
import { useLocalize } from '~/hooks';
import ToolResultContainer from './ToolResultContainer';
import ToolApprovalContainer from './ToolApprovalContainer';
import MarkdownLite from './MarkdownLite';
import { cn } from '~/utils';

const GOOGLE_DOCS_ICON = '/assets/google_docs.svg';

type DocsCreateProps = {
  args: string | Record<string, unknown>;
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
};

type DocsCreateArgs = {
  title?: string;
  folderName?: string;
  markdown?: string;
};

type DocsCreateOutput = {
  documentId?: string;
  title?: string;
  error?: string;
};

function parseArgs(args: string | Record<string, unknown>): DocsCreateArgs {
  try {
    const parsed = typeof args === 'string' ? JSON.parse(args) : args;
    if (!parsed || typeof parsed !== 'object') return {};
    return {
      title: typeof parsed.title === 'string' ? parsed.title : undefined,
      folderName: typeof parsed.folderName === 'string' ? parsed.folderName : undefined,
      markdown: typeof parsed.markdown === 'string' ? parsed.markdown : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Parse output: { documentId, title } or { error }.
 * Handles: MCP content-array, JSON, compact JSON {d,t,e}, and TOON/key-value formats.
 */
function parseOutput(output: string | null | undefined): DocsCreateOutput | null {
  if (!output || typeof output !== 'string') return null;
  const trimmed = output.trim();
  if (!trimmed) return null;

  try {
    if (trimmed.startsWith('[')) {
      const arr = JSON.parse(trimmed) as unknown[];
      const first = arr?.[0];
      const inner =
        typeof first === 'string'
          ? first
          : first &&
              typeof first === 'object' &&
              'text' in first &&
              typeof (first as { text?: string }).text === 'string'
            ? (first as { text: string }).text
            : null;
      if (inner) return parseOutput(inner);
    }
    if (trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed) as {
        documentId?: string;
        title?: string;
        d?: string;
        t?: string;
        error?: string;
        e?: string;
      };
      if (!parsed || typeof parsed !== 'object') return null;
      const err = parsed.error ?? parsed.e;
      if (err) return { error: typeof err === 'string' ? err : String(err) };
      const documentId = parsed.documentId ?? parsed.d;
      const title = parsed.title ?? parsed.t;
      if (documentId || title) {
        return { documentId, title };
      }
    }
    // TOON or key-value format: "documentId: xxx title: yyy" - extract success data
    const docIdMatch = trimmed.match(/documentId\s*[=:]\s*["']?([A-Za-z0-9_-]+)["']?/i);
    const titleMatch = trimmed.match(/title\s*[=:]\s*["']?(.+?)["']?(?:\s+documentId|\s*$)/is);
    const titleMatchAlt = trimmed.match(/title\s*[=:]\s*["']?([^"'\n]+)["']?/i);
    const documentId = docIdMatch?.[1];
    const title = (titleMatch?.[1] ?? titleMatchAlt?.[1])?.trim();
    if (documentId || title) {
      return { documentId: documentId ?? undefined, title: title || undefined };
    }
    return trimmed ? { error: trimmed } : null;
  } catch {
    // Fallback: try key-value extraction
    const docIdMatch = trimmed.match(/documentId\s*[=:]\s*["']?([A-Za-z0-9_-]+)["']?/i);
    const titleMatch = trimmed.match(/title\s*[=:]\s*["']?([^"'\n]+)["']?/i);
    const documentId = docIdMatch?.[1];
    const title = titleMatch?.[1]?.trim();
    if (documentId || title) {
      return { documentId: documentId ?? undefined, title: title || undefined };
    }
    return trimmed ? { error: trimmed } : null;
  }
}

const DOCS_EDIT_URL = 'https://docs.google.com/document/d';

export default function DocsCreate({
  args,
  output,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
}: DocsCreateProps) {
  const { conversationId, messageId } = useMessageContext();
  const expandedToolCalls = useRecoilValue(store.expandedToolCallsAtom);
  const setExpandedToolCalls = useSetRecoilState(store.expandedToolCallsAtom);
  const [localExpanded, setLocalExpanded] = useState(false);

  const { pendingMatches, approvalStatus, handleApprove, handleDeny, approvalSubmitting, denialReason } =
    useToolApproval(toolCallId, output ?? '');
  const openInArtifact = useOpenInArtifact();
  const localize = useLocalize();

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
  const parsedOutput = useMemo(() => parseOutput(output), [output]);

  const title = parsedArgs.title ?? parsedOutput?.title ?? 'Untitled';
  const documentId = parsedOutput?.documentId;
  const outputError = parsedOutput?.error;
  const docUrl = documentId ? `${DOCS_EDIT_URL}/${documentId}/edit` : null;

  const showApprovalBar = approvalStatus !== null;
  const isPending = approvalStatus === 'pending';
  const hasMarkdown = !!parsedArgs.markdown;
  const hasExpandableContent = hasMarkdown || hasOutput;

  const summary =
    isPending || !hasOutput
      ? `Creating Google Doc: ${title.length > 40 ? `${title.slice(0, 40)}...` : title}`
      : outputError
        ? `Failed to create: ${title}`
        : `Created Google Doc: ${title.length > 40 ? `${title.slice(0, 40)}...` : title}`;

  const hasError = error || cancelled || !!outputError;

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
        toolName="docs_create"
      >
        {hasMarkdown ? (
          <>
            <p className="mb-2 text-xs font-medium text-text-secondary">
              Preview of content to be created:
            </p>
            <div className="prose prose-sm dark:prose-invert max-w-none text-text-primary">
              <MarkdownLite content={parsedArgs.markdown ?? ''} codeExecution={false} />
            </div>
          </>
        ) : (
          <p className="text-sm text-text-secondary">
            {parsedArgs.title ? `Creating blank document: "${parsedArgs.title}"` : 'Creating document'}
          </p>
        )}
      </ToolApprovalContainer>
    );
  }

  return (
    <ToolResultContainer
      icon={
        <img
          src={GOOGLE_DOCS_ICON}
          alt=""
          className="size-5 shrink-0"
          aria-hidden="true"
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/assets/google_drive.svg';
          }}
        />
      }
      summary={summary}
      isExpanded={isExpanded}
      onToggle={toggleExpand}
      isLoading={isLoading}
      error={hasError}
      hasExpandableContent={hasExpandableContent || hasOutput}
      minExpandHeight={140}
      denialReason={denialReason}
    >
      {outputError ? (
        <p className="text-sm text-red-500">{outputError}</p>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-text-secondary">-</span>
            <span className="min-w-0 flex-1 truncate font-medium text-text-primary">{title}</span>
            <span className="flex shrink-0 items-center gap-2">
              {docUrl && (
                <a
                  href={docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                  title={title}
                >
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  Open
                </a>
              )}
              {hasMarkdown && (
                <button
                  type="button"
                  onClick={() =>
                    openInArtifact({
                      content: parsedArgs.markdown ?? '',
                      filename: `${title.replace(/[^a-zA-Z0-9.-]/g, '_')}.md`,
                      type: 'text/markdown',
                    })
                  }
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  {localize('com_ui_preview_in_artifact') || 'Preview in Artifact'}
                </button>
              )}
            </span>
          </div>
          {documentId && (
            <div className="pl-4 font-mono text-xs text-text-secondary break-all">
              ID: {documentId}
            </div>
          )}
          {parsedArgs.folderName && (
            <div className="pl-4 text-text-secondary">Folder: {parsedArgs.folderName}</div>
          )}
        </div>
      )}
    </ToolResultContainer>
  );
}
