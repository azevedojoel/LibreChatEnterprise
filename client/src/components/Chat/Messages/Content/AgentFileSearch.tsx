import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { FileSearch } from 'lucide-react';
import { Tools } from 'librechat-data-provider';
import type { TAttachment } from 'librechat-data-provider';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useProgress } from '~/hooks';
import ToolResultContainer from './ToolResultContainer';

type AgentFileSearchProps = {
  args: string | Record<string, unknown>;
  output?: string | null;
  attachments?: TAttachment[];
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
};

interface FileSource {
  fileId: string;
  fileName: string;
  pages?: number[];
  relevance?: number;
}

const hasFileExtension = (n: string) => /\.(pdf|docx?|xlsx?|txt|md|csv|pptx?|jpg|jpeg|png|gif|webp)$/i.test(n ?? '');

/** Extract deduplicated file names from file_search attachment sources (source of truth) */
function getSourcesFromAttachment(
  attachments: TAttachment[] | undefined,
  toolCallId: string | undefined,
): string[] {
  if (!attachments?.length || !toolCallId) return [];
  const attachment = attachments.find(
    (a) => a.type === Tools.file_search && a.toolCallId === toolCallId,
  );
  const fileSearchData = attachment?.[Tools.file_search] as { sources?: FileSource[] } | undefined;
  const sources = fileSearchData?.sources;
  if (!Array.isArray(sources)) return [];

  const deduplicated = new Map<string, string>();
  for (const source of sources) {
    const fileId = source.fileId;
    const fileName = source.fileName || 'Unknown file';
    if (fileId && hasFileExtension(fileName) && !deduplicated.has(fileId)) {
      deduplicated.set(fileId, fileName);
    }
  }
  return Array.from(deduplicated.values());
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

/** Extract friendly message and file names from file_search output */
function parseOutput(output: string | null | undefined): {
  message: string;
  fileNames: string[];
} {
  if (!output) return { message: '', fileNames: [] };
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
    return { message: '', fileNames: [] };
  }

  text = text.trim();
  if (!text) return { message: '', fileNames: [] };

  if (text.includes('No files to search') || text.includes('no embedded files')) {
    return {
      message: 'No files in My Files. Upload documents to enable search.',
      fileNames: [],
    };
  }
  if (text.includes('error authenticating')) {
    return { message: 'Authentication error.', fileNames: [] };
  }
  if (text.includes('No results found') || text.includes('errors occurred while searching')) {
    return { message: 'No matching files found.', fileNames: [] };
  }

  const fileNames: string[] = [];
  const fileMatches = text.matchAll(/File:\s*([^\n]+)/gi);
  for (const m of fileMatches) {
    const name = m[1]?.trim();
    if (name && hasFileExtension(name) && !fileNames.includes(name)) {
      fileNames.push(name);
    }
  }

  const message =
    fileNames.length > 0
      ? `${fileNames.length} result${fileNames.length !== 1 ? 's' : ''} found`
      : 'Search completed';

  return { message, fileNames };
}

export default function AgentFileSearch({
  args,
  output,
  attachments,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
}: AgentFileSearchProps) {
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
  const attachmentFileNames = useMemo(
    () => getSourcesFromAttachment(attachments, toolCallId),
    [attachments, toolCallId],
  );

  // Prefer structured sources from attachment (source of truth); fall back to parsed output
  const fileNames = attachmentFileNames.length > 0 ? attachmentFileNames : parsed.fileNames;
  const message =
    attachmentFileNames.length > 0
      ? `${attachmentFileNames.length} result${attachmentFileNames.length !== 1 ? 's' : ''} found`
      : parsed.message;

  const summary =
    isLoading || !hasOutput
      ? query
        ? `Searching My Files: ${query.length > 40 ? `${query.slice(0, 40)}...` : query}`
        : 'Searching My Files'
      : query
        ? `Searched My Files: ${query.length > 40 ? `${query.slice(0, 40)}...` : query}`
        : 'Searched My Files';

  const hasError = error || cancelled;
  const showResultsCount =
    (hasOutput || attachmentFileNames.length > 0) && fileNames.length > 0;

  if (!isLast && !hasOutput && !output) {
    return null;
  }

  return (
    <ToolResultContainer
      icon={<FileSearch className="size-5 shrink-0 text-text-secondary" aria-hidden="true" />}
      summary={summary}
      resultsCount={showResultsCount ? fileNames.length : undefined}
      isExpanded={isExpanded}
      onToggle={toggleExpand}
      isLoading={isLoading}
      error={hasError}
      hasExpandableContent={hasOutput || !!query}
    >
      {message ? (
        <div className="space-y-2 text-sm">
          <p className="text-text-primary">{message}</p>
          {fileNames.length > 0 && (
            <ul className="space-y-1.5">
              {fileNames.map((name, idx) => (
                <li key={`${name}-${idx}`} className="flex items-center gap-2">
                  <span className="text-text-secondary">-</span>
                  <span className="min-w-0 flex-1 truncate text-text-primary">{name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </ToolResultContainer>
  );
}
