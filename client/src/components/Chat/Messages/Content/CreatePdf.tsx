import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { FileDown } from 'lucide-react';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useProgress } from '~/hooks';
import ToolResultContainer from './ToolResultContainer';
import { AttachmentGroup } from './Parts';
import { useAttachmentLink } from './Parts/LogLink';
import type { TAttachment, TFile, TAttachmentMetadata } from 'librechat-data-provider';

type CreatePdfProps = {
  args: string | Record<string, unknown>;
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
  attachments?: TAttachment[];
};

function parseArgs(args: string | Record<string, unknown>): { filename?: string } {
  try {
    const parsed = typeof args === 'string' ? JSON.parse(args) : args;
    if (!parsed || typeof parsed !== 'object') return {};
    const filename = typeof parsed.filename === 'string' ? parsed.filename : undefined;
    return { filename };
  } catch {
    return {};
  }
}

/** Extract filename from output text like "Created PDF: X. The file..." or "Error creating PDF: ..." */
function parseOutput(output: string | null | undefined): {
  filename?: string;
  error?: string;
} {
  if (!output) return {};
  let text: string;
  if (typeof output === 'string') {
    const trimmed = output.trim();
    if (trimmed.startsWith('[')) {
      try {
        const arr = JSON.parse(trimmed) as unknown[];
        const first = arr?.[0];
        text = typeof first === 'string' ? first : trimmed;
      } catch {
        text = trimmed;
      }
    } else {
      text = trimmed;
    }
  } else if (Array.isArray(output) && typeof output[0] === 'string') {
    text = (output[0] as string).trim();
  } else {
    return {};
  }
  text = text.trim();
  if (text.toLowerCase().startsWith('error')) {
    return { error: text };
  }
  const match = text.match(/Created PDF:\s*([^.]+)\./);
  if (match?.[1]) {
    return { filename: match[1].trim() };
  }
  return {};
}

export default function CreatePdf({
  args,
  output,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
  attachments = [],
}: CreatePdfProps) {
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

  const parsedArgs = useMemo(() => parseArgs(args), [args]);
  const parsedOutput = useMemo(() => parseOutput(output), [output]);
  const outputError = parsedOutput?.error;

  const firstAttachment = attachments?.[0] as (TAttachment & TFile & TAttachmentMetadata) | undefined;
  const filename =
    firstAttachment?.filename ?? parsedOutput?.filename ?? parsedArgs?.filename ?? 'document.pdf';

  const displayFilename = filename.length > 40 ? `${filename.slice(0, 40)}...` : filename;

  const summary =
    isLoading || !hasOutput
      ? `Creating PDF: ${displayFilename}`
      : outputError
        ? `Failed to create PDF`
        : `Created PDF: ${displayFilename}`;

  const hasError = error || cancelled || !!outputError;
  const hasExpandableContent = hasOutput || (attachments?.length ?? 0) > 0;

  if (!isLast && !hasOutput && !output) {
    return null;
  }

  return (
    <>
      <ToolResultContainer
        icon={<FileDown className="size-5 shrink-0 text-text-secondary" aria-hidden="true" />}
        summary={summary}
        isExpanded={isExpanded}
        onToggle={toggleExpand}
        isLoading={isLoading}
        error={hasError}
        hasExpandableContent={hasExpandableContent}
        minExpandHeight={80}
      >
        {outputError ? (
          <p className="text-sm text-red-500">{outputError}</p>
        ) : (
          <CreatePdfDownloadLink
            attachment={firstAttachment}
            filename={filename}
          />
        )}
      </ToolResultContainer>
      {attachments && attachments.length > 0 && <AttachmentGroup attachments={attachments} />}
    </>
  );
}

function CreatePdfDownloadLink({
  attachment,
  filename,
}: {
  attachment?: TAttachment & TFile & TAttachmentMetadata;
  filename: string;
}) {
  const { handleDownload } = useAttachmentLink({
    href: attachment?.filepath ?? '',
    filename: attachment?.filename ?? filename,
    file_id: attachment?.file_id,
    user: attachment?.user,
    source: attachment?.source,
  });

  if (!attachment?.filepath && !attachment?.file_id) {
    return (
      <div className="space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-text-secondary">-</span>
          <span className="min-w-0 flex-1 truncate font-medium text-text-primary">{filename}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-text-secondary">-</span>
        <span className="min-w-0 flex-1 truncate font-medium text-text-primary">{filename}</span>
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
          title={filename}
        >
          <FileDown className="size-3.5" aria-hidden="true" />
          Download
        </button>
      </div>
    </div>
  );
}
