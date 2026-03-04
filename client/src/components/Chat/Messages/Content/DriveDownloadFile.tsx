import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useProgress } from '~/hooks';
import ToolResultContainer from './ToolResultContainer';

const DRIVE_ICON = '/assets/google_drive.svg';

type DriveDownloadFileProps = {
  args: string | Record<string, unknown>;
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
};

type DriveDownloadFileArgs = {
  fileId?: string;
  destination?: string;
  localPath?: string;
  workspace_path?: string;
};

type ParsedOutput = {
  filename?: string;
  error?: string;
  destination?: 'my_files' | 'workspace' | 'path';
};

function parseArgs(args: string | Record<string, unknown>): DriveDownloadFileArgs {
  try {
    const parsed = typeof args === 'string' ? JSON.parse(args) : args;
    if (!parsed || typeof parsed !== 'object') return {};
    return {
      fileId: typeof parsed.fileId === 'string' ? parsed.fileId : undefined,
      destination: typeof parsed.destination === 'string' ? parsed.destination : undefined,
      localPath: typeof parsed.localPath === 'string' ? parsed.localPath : undefined,
      workspace_path: typeof parsed.workspace_path === 'string' ? parsed.workspace_path : undefined,
    };
  } catch {
    return {};
  }
}

function parseOutput(output: string | null | undefined): ParsedOutput | null {
  if (!output || typeof output !== 'string') return null;
  const trimmed = output.trim();

  // Backwards compat: content-array or tuple stringified
  if (trimmed.startsWith('[')) {
    try {
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
    } catch {
      /* ignore */
    }
  }

  // JSON error
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: string };
      const err = parsed?.error;
      return typeof err === 'string' ? { error: err } : null;
    } catch {
      return null;
    }
  }

  // Success: "Successfully saved X to My Files."
  const myFilesMatch = trimmed.match(/Successfully saved (.+?) to My Files\.?/);
  if (myFilesMatch) {
    const filename = myFilesMatch[1].trim();
    return { filename, destination: 'my_files' };
  }

  // Success: "Successfully downloaded X to workspace."
  const workspaceMatch = trimmed.match(/Successfully downloaded (.+?) to workspace\.?/);
  if (workspaceMatch) {
    const filename = workspaceMatch[1].trim();
    return { filename, destination: 'workspace' };
  }

  // Success: "Successfully downloaded file X to {path}"
  const pathMatch = trimmed.match(/Successfully downloaded file (.+?) to /);
  if (pathMatch) {
    const filename = pathMatch[1].trim();
    return { filename, destination: 'path' };
  }

  // Fallback: "Resource URI: drive-file:X"
  const uriMatch = trimmed.match(/Resource URI: drive-file:(.+?)(?:\n|$)/);
  if (uriMatch) {
    const filename = uriMatch[1].trim();
    return { filename, destination: 'my_files' };
  }

  // Error or unsupported message (e.g. "This is a Google Doc...")
  if (trimmed.startsWith('This is a') || trimmed.toLowerCase().includes('error')) {
    return { error: trimmed };
  }

  return null;
}

export default function DriveDownloadFile({
  args,
  output,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
}: DriveDownloadFileProps) {
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
  const filename = parsedOutput?.filename ?? parsedArgs.fileId ?? 'file';

  const truncatedFilename =
    filename.length > 40 ? `${filename.slice(0, 40)}...` : filename;

  const summary =
    isLoading || !hasOutput
      ? `Downloading ${truncatedFilename}`
      : outputError
        ? `Failed to download: ${truncatedFilename}`
        : parsedOutput?.destination === 'my_files'
          ? `Downloaded ${truncatedFilename} to My Files`
          : parsedOutput?.destination === 'workspace'
            ? `Downloaded ${truncatedFilename} to workspace`
            : `Downloaded ${truncatedFilename}`;

  const hasError = error || cancelled || !!outputError;

  if (!isLast && !hasOutput && !output) {
    return null;
  }

  return (
    <ToolResultContainer
      icon={<img src={DRIVE_ICON} alt="" className="size-5 shrink-0" aria-hidden="true" />}
      summary={summary}
      isExpanded={isExpanded}
      onToggle={toggleExpand}
      isLoading={isLoading}
      error={hasError}
      hasExpandableContent={!!parsedArgs.fileId || !!parsedOutput?.filename || hasOutput}
      minExpandHeight={60}
    >
      {outputError ? (
        <p className="text-sm text-red-500">{outputError}</p>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-text-secondary">-</span>
            <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
              {filename}
            </span>
          </div>
          {parsedOutput?.destination === 'my_files' && (
            <p className="pl-4 text-xs text-text-secondary">Saved to My Files</p>
          )}
        </div>
      )}
    </ToolResultContainer>
  );
}
