import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { Search } from 'lucide-react';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useProgress } from '~/hooks';
import ToolResultContainer from './ToolResultContainer';
import { getToolDisplayName } from '~/utils/toolDisplayNames';

type DiscoverySearchProps = {
  args: string | Record<string, unknown>;
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
};

type ToolRef = {
  name?: string;
};

/** Parse tool_search JSON output: { found, tools: [{ name, ... }], ... }. Handles content-array stringified format. */
function parseOutput(output: string | null | undefined): {
  tools: ToolRef[];
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
      return trimmed ? { tools: [], error: trimmed } : null;
    }
    const parsed = JSON.parse(trimmed) as {
      tools?: Array<{ name?: string }>;
      found?: number;
    };
    if (!parsed || typeof parsed !== 'object') return null;
    const tools = Array.isArray(parsed.tools) ? parsed.tools.map((t) => ({ name: t?.name })) : [];
    return { tools };
  } catch {
    // Try to find JSON within output (e.g. warnings prepended)
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as {
          tools?: Array<{ name?: string }>;
        };
        if (parsed?.tools && Array.isArray(parsed.tools)) {
          return {
            tools: parsed.tools.map((t) => ({ name: t?.name })),
          };
        }
      } catch {
        /* ignore */
      }
    }
    return trimmed ? { tools: [], error: trimmed } : null;
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

export default function DiscoverySearch({
  args,
  output,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
}: DiscoverySearchProps) {
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

  const tools = parsed?.tools ?? [];
  const discoveryError = parsed?.error;
  const resultsCount = tools.length;

  const summary = query ? `Searched for tools: ${query}` : 'Searched for tools';

  const hasError = error || cancelled || !!discoveryError;
  const showResultsCount = hasOutput && !discoveryError;

  if (!isLast && !hasOutput && !output) {
    return null;
  }

  return (
    <ToolResultContainer
      icon={<Search className="size-5 text-text-secondary" aria-hidden="true" />}
      summary={summary}
      resultsCount={showResultsCount ? resultsCount : undefined}
      isExpanded={isExpanded}
      onToggle={toggleExpand}
      isLoading={isLoading}
      error={hasError}
      hasExpandableContent={hasOutput}
      minExpandHeight={140}
    >
      {discoveryError ? (
        <p className="text-sm text-red-500">{discoveryError}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tools.map((tool, idx) => {
            const name = tool.name;
            if (!name) return null;
            const displayName = getToolDisplayName(name);
            return (
              <span
                key={`${name}-${idx}`}
                className="rounded-full bg-surface-tertiary px-2.5 py-1 text-xs text-text-secondary"
              >
                {displayName}
              </span>
            );
          })}
        </div>
      )}
    </ToolResultContainer>
  );
}
