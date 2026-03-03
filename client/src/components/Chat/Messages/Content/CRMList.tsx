import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useProgress } from '~/hooks';
import { parseCRMListOutputGeneric } from '~/utils/parseToolOutput';
import ToolResultContainer from './ToolResultContainer';

type CRMItemType =
  | 'pipelines'
  | 'contacts'
  | 'organizations'
  | 'deals'
  | 'activities';

type CRMListProps = {
  itemType: CRMItemType;
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
};

const ITEM_TYPE_CONFIG: Record<
  CRMItemType,
  { label: string; nameKey: string; secondaryKey?: string }
> = {
  pipelines: { label: 'pipeline', nameKey: 'name' },
  contacts: { label: 'contact', nameKey: 'name', secondaryKey: 'email' },
  organizations: { label: 'organization', nameKey: 'name' },
  deals: { label: 'deal', nameKey: 'title', secondaryKey: 'stage' },
  activities: { label: 'activity', nameKey: 'summary', secondaryKey: 'type' },
};

function getItemLabel(item: Record<string, unknown>, config: (typeof ITEM_TYPE_CONFIG)[CRMItemType]): string {
  const name = item[config.nameKey] ?? item.name ?? item.summary;
  return typeof name === 'string' ? name : 'Unnamed';
}

function getItemSecondary(item: Record<string, unknown>, config: (typeof ITEM_TYPE_CONFIG)[CRMItemType]): string | null {
  if (!config.secondaryKey) return null;
  const val = item[config.secondaryKey];
  if (val == null) return null;
  if (typeof val === 'number') return `$${val}`;
  return String(val);
}

export default function CRMList({
  itemType,
  output,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
}: CRMListProps) {
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

  const keys = useMemo(() => {
    switch (itemType) {
      case 'pipelines':
        return ['pipelines', 'items'];
      case 'contacts':
        return ['contacts', 'items'];
      case 'organizations':
        return ['organizations', 'orgs', 'items'];
      case 'deals':
        return ['deals', 'items'];
      case 'activities':
        return ['activities', 'items'];
      default:
        return ['items'];
    }
  }, [itemType]);

  const parsed = useMemo(
    () => parseCRMListOutputGeneric(output, keys),
    [output, keys],
  );
  const items = parsed?.items ?? [];
  const outputError = parsed?.error;
  const resultsCount = items.length;
  const config = ITEM_TYPE_CONFIG[itemType];

  const summary = `Listed ${resultsCount} ${config.label}${resultsCount === 1 ? '' : 's'}`;
  const hasError = error || cancelled || !!outputError;
  const showResultsCount = hasOutput && !outputError;

  if (!isLast && !hasOutput && !output) {
    return null;
  }

  return (
    <ToolResultContainer
      icon={
        <svg
          className="size-5 shrink-0 text-text-secondary"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      }
      summary={summary}
      resultsCount={showResultsCount ? resultsCount : undefined}
      isExpanded={isExpanded}
      onToggle={toggleExpand}
      isLoading={isLoading}
      error={hasError}
      hasExpandableContent={hasOutput}
    >
      {outputError ? (
        <p className="text-sm text-red-500">{outputError}</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {items.map((item, idx) => {
            const primary = getItemLabel(item, config);
            const secondary = getItemSecondary(item, config);
            const id = item.id ?? item._id ?? idx;
            return (
              <li key={String(id)} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-text-secondary">-</span>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-text-primary">{primary}</span>
                  {secondary && (
                    <span className="mt-0.5 block text-xs text-text-secondary">{secondary}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </ToolResultContainer>
  );
}
