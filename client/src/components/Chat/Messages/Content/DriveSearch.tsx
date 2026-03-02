import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { ExternalLink } from 'lucide-react';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useProgress } from '~/hooks';
import { formatDate } from '~/utils';
import ToolResultContainer from './ToolResultContainer';

const GOOGLE_DRIVE_ICON = '/assets/google_drive.svg';

type DriveSearchProps = {
  args: string | Record<string, unknown>;
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
};

type DriveFile = {
  id?: string;
  name?: string;
  modifiedTime?: string;
};

/** Compact JSON from API: f=files, f[].i=id, f[].n=name, f[].m=modifiedTime, e=error. Plain string = error (formatter short-circuit). */
function parseOutput(output: string | null | undefined): {
  files: DriveFile[];
  error?: string;
} | null {
  if (!output || typeof output !== 'string') return null;
  const trimmed = output.trim();
  try {
    // Backwards compat: if output is content-array stringified [{"type":"text","text":"..."}] or [text, artifacts], extract inner text
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
    if (!trimmed.startsWith('{')) {
      return trimmed ? { files: [], error: trimmed } : null;
    }
    const parsed = JSON.parse(trimmed) as {
      f?: Array<{ i?: string; n?: string; m?: string }>;
      e?: string;
    };
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.e) return { files: [], error: parsed.e };
    const f = parsed.f;
    const files: DriveFile[] = Array.isArray(f)
      ? f.map((item) => ({
          id: item?.i,
          name: item?.n,
          modifiedTime: item?.m,
        }))
      : [];
    return { files };
  } catch {
    return trimmed ? { files: [], error: trimmed } : null;
  }
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

const DRIVE_FILE_URL = 'https://drive.google.com/file/d';

export default function DriveSearch({
  args,
  output,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
}: DriveSearchProps) {
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

  const files = parsed?.files ?? [];
  const driveError = parsed?.error;
  const resultsCount = files.length;

  const summary = query ? `Searched Google Drive: ${query}` : 'Searched Google Drive';

  const hasError = error || cancelled || !!driveError;
  const showResultsCount = hasOutput && !driveError;

  if (!isLast && !hasOutput && !output) {
    return null;
  }

  return (
    <ToolResultContainer
      icon={<img src={GOOGLE_DRIVE_ICON} alt="" className="size-5 shrink-0" aria-hidden="true" />}
      summary={summary}
      resultsCount={showResultsCount ? resultsCount : undefined}
      isExpanded={isExpanded}
      onToggle={toggleExpand}
      isLoading={isLoading}
      error={hasError}
      hasExpandableContent={hasOutput}
    >
      {driveError ? (
        <p className="text-sm text-red-500">{driveError}</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {files.map((file, idx) => {
            const name = file.name ?? 'Untitled';
            const id = file.id;
            const url = id ? `${DRIVE_FILE_URL}/${id}/view` : null;
            const modified = file.modifiedTime ? formatDate(file.modifiedTime) : null;
            return (
              <li key={file.id ?? idx} className="flex items-center gap-2">
                <span className="text-text-secondary">-</span>
                <span className="min-w-0 flex-1 truncate text-text-primary">{name}</span>
                {modified && <span className="shrink-0 text-text-secondary">{modified}</span>}
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
                    title={name}
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
