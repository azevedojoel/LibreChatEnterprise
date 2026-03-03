import { useMemo, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import store from '~/store';
import { useMessageContext } from '~/Providers';
import { useProgress, useToolApproval } from '~/hooks';
import { parseCRMSingleOutput } from '~/utils/parseToolOutput';
import ToolResultContainer from './ToolResultContainer';
import ToolApprovalBar from './ToolApprovalBar';
import { cn } from '~/utils';

type CRMEntityType = 'contact' | 'organization' | 'deal' | 'pipeline';

type CRMCardProps = {
  entityType: CRMEntityType;
  action: 'create' | 'update' | 'get';
  args?: string | Record<string, unknown>;
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
  toolName?: string;
};

const ENTITY_CONFIG: Record<
  CRMEntityType,
  { label: string; nameKey: string; secondaryKeys?: string[] }
> = {
  contact: { label: 'contact', nameKey: 'name', secondaryKeys: ['email', 'phone', 'status'] },
  organization: { label: 'organization', nameKey: 'name', secondaryKeys: [] },
  deal: { label: 'deal', nameKey: 'title', secondaryKeys: ['stage', 'value'] },
  pipeline: { label: 'pipeline', nameKey: 'name', secondaryKeys: ['stages'] },
};

const CRM_ICON = (
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
);

function parseArgs(args: string | Record<string, unknown>): Record<string, unknown> {
  try {
    const parsed = typeof args === 'string' ? JSON.parse(args) : args;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function getItemName(item: Record<string, unknown>, nameKey: string): string {
  const name = item[nameKey] ?? item.name;
  return typeof name === 'string' ? name : 'Unnamed';
}

function formatSecondary(item: Record<string, unknown>, keys: string[]): string[] {
  return keys
    .map((k) => {
      const v = item[k];
      if (v == null) return null;
      if (Array.isArray(v)) return `${k}: ${v.join(', ')}`;
      if (typeof v === 'number') return k === 'amount' || k === 'value' ? `$${v}` : `${k}: ${v}`;
      return `${k}: ${String(v)}`;
    })
    .filter((s): s is string => s != null);
}

export default function CRMCard({
  entityType,
  action,
  args = '',
  output,
  initialProgress = 0.1,
  isSubmitting,
  isLast,
  toolCallId,
  toolName,
}: CRMCardProps) {
  const { conversationId, messageId } = useMessageContext();
  const expandedToolCalls = useRecoilValue(store.expandedToolCallsAtom);
  const setExpandedToolCalls = useSetRecoilState(store.expandedToolCallsAtom);
  const [localExpanded, setLocalExpanded] = useState(false);

  const { pendingMatches, approvalStatus, handleApprove, handleDeny, approvalSubmitting } =
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

  const parsedArgs = useMemo(() => parseArgs(args), [args]);
  const parsedOutput = useMemo(() => parseCRMSingleOutput(output), [output]);
  const item = parsedOutput?.item;
  const outputError = parsedOutput?.error;

  const config = ENTITY_CONFIG[entityType];
  const name =
    getItemName(item ?? parsedArgs, config.nameKey) ||
    getItemName(parsedArgs, config.nameKey) ||
    'Untitled';

  const actionLabels = {
    create: { verb: 'Added', loading: 'Adding' },
    update: { verb: 'Updated', loading: 'Updating' },
    get: { verb: 'Retrieved', loading: 'Retrieving' },
  };
  const labels = actionLabels[action];
  const summary =
    isLoading || !hasOutput
      ? `${labels.loading} ${config.label}: ${name.length > 35 ? `${name.slice(0, 35)}...` : name}`
      : outputError
        ? `Failed to ${action} ${config.label}`
        : `${labels.verb} ${config.label}: ${name.length > 35 ? `${name.slice(0, 35)}...` : name}`;

  const hasError = error || cancelled || !!outputError;

  const showApprovalBar = approvalStatus !== null;
  const isPending = approvalStatus === 'pending';

  if (!isLast && !hasOutput && !pendingMatches && !output) {
    return null;
  }

  if (showApprovalBar && isPending) {
    return (
      <div className="my-2 flex flex-col gap-2">
        <ToolApprovalBar
          onApprove={handleApprove}
          onDeny={handleDeny}
          onToggleExpand={toggleExpand}
          isExpanded={isExpanded}
          isSubmitting={approvalSubmitting}
          toolName={toolName}
        />
        <div
          className={cn(
            'overflow-hidden rounded-lg border border-border-light bg-surface-secondary transition-all duration-300',
            isExpanded ? 'max-h-[400px]' : 'max-h-0',
          )}
        >
          <div className="max-h-[396px] overflow-y-auto border-t border-border-light px-3 py-2">
            <div className="space-y-2 text-sm">
              {Object.entries(parsedArgs).map(([k, v]) =>
                v != null && v !== '' ? (
                  <div key={k}>
                    <span className="text-text-secondary">{k}: </span>
                    <span className="font-medium text-text-primary">
                      {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                    </span>
                  </div>
                ) : null,
              )}
              {Object.keys(parsedArgs).length === 0 && (
                <p className="text-text-secondary">No details</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ToolResultContainer
      icon={CRM_ICON}
      summary={summary}
      isExpanded={isExpanded}
      onToggle={toggleExpand}
      isLoading={isLoading}
      error={hasError}
      hasExpandableContent={!!item || !!parsedArgs?.name || hasOutput}
      minExpandHeight={100}
    >
      {outputError ? (
        <p className="text-sm text-red-500">{outputError}</p>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <span className="text-text-secondary">-</span>
            <span className="min-w-0 flex-1 font-medium text-text-primary">{name}</span>
          </div>
          {item && config.secondaryKeys && config.secondaryKeys.length > 0 && (
            <div className="space-y-0.5 pl-4 text-xs text-text-secondary">
              {formatSecondary(item, config.secondaryKeys).map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </ToolResultContainer>
  );
}
