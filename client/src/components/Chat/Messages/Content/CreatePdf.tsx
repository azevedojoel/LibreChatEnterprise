import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { FileDown, ExternalLink } from 'lucide-react';
import { useToastContext } from '@librechat/client';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useProgress } from '~/hooks';
import ToolResultContainer from './ToolResultContainer';
import { AttachmentGroup } from './Parts';
import { useAttachmentLink } from './Parts/LogLink';
import useOpenInArtifact from '~/hooks/Artifacts/useOpenInArtifact';
import { dataService } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
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

/** Extract filename from output text like "Created document: X. ..." or "Error creating document: ..." */
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
  const match = text.match(/Created document:\s*([^.]+)\./);
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
    firstAttachment?.filename ?? parsedOutput?.filename ?? parsedArgs?.filename ?? 'document.html';

  const displayFilename = filename.length > 40 ? `${filename.slice(0, 40)}...` : filename;

  const summary =
    isLoading || !hasOutput
      ? `Creating document: ${displayFilename}`
      : outputError
        ? `Failed to create document`
        : `Created document: ${displayFilename}`;

  const hasError = error || cancelled || !!outputError;
  const hasExpandableContent = hasOutput || (attachments?.length ?? 0) > 0;

  if (!isLast && !hasOutput && !output) {
    return null;
  }

  return (
    <>
      <ToolResultContainer
        icon={<ExternalLink className="size-5 shrink-0 text-text-secondary" aria-hidden="true" />}
        summary={summary}
        isExpanded={isExpanded}
        onToggle={toggleExpand}
        isLoading={isLoading}
        error={hasError}
        hasExpandableContent={hasExpandableContent}
        minExpandHeight={80}
        headerActions={
          !outputError &&
          firstAttachment?.file_id &&
          firstAttachment?.user && (
            <CreateDocumentHeaderActions
              attachment={firstAttachment}
              filename={filename}
            />
          )
        }
      >
        {outputError ? (
          <p className="text-sm text-red-500">{outputError}</p>
        ) : (
          <CreateDocumentLinks
            attachment={firstAttachment}
            filename={filename}
          />
        )}
      </ToolResultContainer>
      {attachments && attachments.length > 0 && <AttachmentGroup attachments={attachments} />}
    </>
  );
}

function CreateDocumentHeaderActions({
  attachment,
  filename,
}: {
  attachment: TAttachment & TFile & TAttachmentMetadata;
  filename: string;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const openInArtifact = useOpenInArtifact();
  const [isOpening, setIsOpening] = useState(false);

  const handleOpenInArtifact = useCallback(async () => {
    if (!attachment?.file_id || !attachment?.user) return;
    setIsOpening(true);
    try {
      const response = await dataService.getFileDownload(attachment.user, attachment.file_id);
      const blob = response.data as Blob;
      const content = await blob.text();
      openInArtifact({
        content,
        filename: attachment.filename ?? filename,
        type: 'text/html',
      });
    } catch (err) {
      console.error('Failed to open document in artifact:', err);
      showToast({
        status: 'error',
        message: localize('com_ui_open_in_artifact_error'),
      });
    } finally {
      setIsOpening(false);
    }
  }, [
    attachment?.file_id,
    attachment?.user,
    attachment?.filename,
    filename,
    openInArtifact,
    showToast,
    localize,
  ]);

  return (
    <button
      type="button"
      onClick={handleOpenInArtifact}
      disabled={isOpening}
      className="inline-flex shrink-0 items-center gap-1 text-sm text-primary hover:underline disabled:opacity-50"
      title={localize('com_ui_open_in_artifact')}
    >
      <ExternalLink className="size-3.5" aria-hidden="true" />
      {isOpening ? '...' : localize('com_ui_open_in_artifact')}
    </button>
  );
}

function CreateDocumentLinks({
  attachment,
  filename,
}: {
  attachment?: TAttachment & TFile & TAttachmentMetadata;
  filename: string;
}) {
  const localize = useLocalize();
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
          {localize('com_ui_download')}
        </button>
      </div>
    </div>
  );
}
