import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import {
  ArrowRight,
  Bot,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  FileText,
  Mail,
  Play,
  Search,
  Square,
  XCircle,
} from 'lucide-react';
import { Tools } from 'librechat-data-provider';
import { useLocalize, useToolApproval } from '~/hooks';
import { useMessageContext } from '~/Providers';
import { useAgentsMapContext } from '~/Providers';
import store from '~/store';
import { useSubAgentStream } from '~/hooks/SubAgent/useSubAgentStream';
import { useAbortStreamMutation } from '~/data-provider/SSE/mutations';
import ToolApprovalBar from './ToolApprovalBar';
import { AttachmentGroup } from './Parts/Attachment';
import { cn, getToolTreeDisplayName } from '~/utils';
import type { TranslationKeys } from '~/hooks';

const SUB_AGENT_ICONS = [Search, ClipboardList, Mail, Bot] as const;

function getSubAgentIcon(idx: number) {
  return SUB_AGENT_ICONS[idx % SUB_AGENT_ICONS.length];
}

type RunSubAgentToolCallProps = {
  args: string | Record<string, unknown>;
  output?: string | null;
  initialProgress?: number;
  isSubmitting: boolean;
  isLast?: boolean;
  toolCallId?: string;
  attachments?: unknown[];
};

type PillData = {
  idx: number;
  agentId: string;
  agentName: string;
  streamId: string | null;
  result?: { agentId: string; success: boolean; output?: string; error?: string };
  isRunning: boolean;
  isQueued: boolean;
};

function getStepLabel(
  step: { type: 'thinking' | 'talking' | 'tool_call'; name?: string },
  localize: (key: TranslationKeys | string, vars?: Record<string, unknown>) => string,
): string {
  if (step.type === 'tool_call' && step.name) {
    return getToolTreeDisplayName(step.name);
  }
  if (step.type === 'thinking') {
    return localize('com_sub_agent_step_thinking' as TranslationKeys);
  }
  if (step.type === 'talking') {
    return localize('com_sub_agent_step_talking' as TranslationKeys);
  }
  return '';
}

function SubAgentStepList({
  agentName,
  steps,
  result,
  isRunning,
  isQueued,
  textPreview,
  attachments,
  localize,
}: {
  agentName: string;
  steps: Array<{ type: 'thinking' | 'talking' | 'tool_call'; name?: string }>;
  result?: { success: boolean; error?: string };
  isRunning: boolean;
  isQueued?: boolean;
  textPreview?: string;
  attachments?: Array<{ file_id?: string; filename?: string; filepath?: string; type?: string; width?: number; height?: number; user?: string }>;
  localize: (key: TranslationKeys | string, vars?: Record<string, unknown>) => string;
}) {
  const hasSteps = steps.length > 0;
  const showCompleted = result?.success && !hasSteps;
  const showWorking = !result && isRunning && !hasSteps;
  const showQueued = !result && isQueued && !hasSteps;
  const showError = result && !result.success;
  const showTextPreview = showWorking && textPreview && textPreview.trim().length > 0;

  return (
    <div
      className="mt-1.5 space-y-0.5 text-xs text-text-secondary"
      role="list"
      aria-label={localize('com_sub_agent_step_list' as TranslationKeys)}
    >
      <div className="font-medium text-text-primary">{agentName}</div>
      {hasSteps &&
        steps.map((step, i) => {
          const label = getStepLabel(step, localize);
          return (
            <div
              key={i}
              className="truncate"
              title={label}
            >
              {label}...
            </div>
          );
        })}
      {showCompleted && (
        <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
          <CheckCircle className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{localize('com_sub_agent_completed' as TranslationKeys)}</span>
        </div>
      )}
      {showWorking && (
        <div className="min-w-0">
          {showTextPreview ? (
            <div
              className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-text-primary"
              title={textPreview}
            >
              {textPreview}
            </div>
          ) : (
            <div className="truncate text-text-tertiary">
              {localize('com_sub_agent_working' as TranslationKeys)}...
            </div>
          )}
        </div>
      )}
      {showQueued && (
        <div className="flex items-center gap-1.5 text-text-tertiary">
          <Clock className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{localize('com_sub_agent_queued' as TranslationKeys)}</span>
        </div>
      )}
      {showError && (
        <div className="truncate text-red-500">
          {localize('com_ui_error' as TranslationKeys)}: {result.error ?? ''}
        </div>
      )}
      {attachments && attachments.length > 0 && (
        <div className="mt-2 space-y-1">
          <div className="font-medium text-text-primary">
            {localize('com_sub_agent_files' as TranslationKeys)}
          </div>
          <AttachmentGroup attachments={attachments} />
        </div>
      )}
    </div>
  );
}

export default function RunSubAgentToolCall({
  args: _args = '',
  output = '',
  initialProgress = 0.1,
  isSubmitting,
  isLast = false,
  toolCallId,
}: RunSubAgentToolCallProps) {
  const localize = useLocalize();
  const { conversationId, messageId, agentName } = useMessageContext();
  const agentsMap = useAgentsMapContext();
  const subAgentStreamByToolCallId = useRecoilValue(store.subAgentStreamByToolCallIdAtom);
  const expandedToolCalls = useRecoilValue(store.expandedToolCallsAtom);
  const setExpandedToolCalls = useSetRecoilState(store.expandedToolCallsAtom);
  const [expandedPillIndex, setExpandedPillIndex] = useState<number | null>(null);

  const expandedKey =
    conversationId && messageId && toolCallId
      ? `${conversationId}:${messageId}:${toolCallId}`
      : null;
  const isExpanded = expandedKey ? expandedToolCalls.has(expandedKey) : false;

  const toggleExpand = useCallback(() => {
    if (expandedKey) {
      setExpandedToolCalls((prev) => {
        const next = new Set(prev);
        if (next.has(expandedKey)) next.delete(expandedKey);
        else next.add(expandedKey);
        return next;
      });
    }
  }, [expandedKey, setExpandedToolCalls]);

  const {
    approvalStatus,
    handleApprove,
    handleDeny,
    approvalSubmitting,
    waitingForApprover,
    approverName,
  } = useToolApproval(toolCallId, output ?? '');

  const abortStreamMutation = useAbortStreamMutation();

  const { inputTasks, isSequential } = useMemo(() => {
    try {
      const parsed = typeof _args === 'string' ? JSON.parse(_args || '{}') : _args;
      const tasks = parsed?.tasks;
      const sequential = parsed?.sequential === true;
      if (Array.isArray(tasks) && tasks.length > 0) {
        return {
          inputTasks: tasks
            .filter((t: { agentId?: string; prompt?: string }) => t?.agentId)
            .map((t: { agentId: string; prompt?: string }) => ({
              agentId: String(t.agentId),
              prompt: String(t.prompt ?? '').trim(),
            })),
          isSequential: sequential,
        };
      }
      if (parsed?.agentId && parsed?.prompt != null) {
        return {
          inputTasks: [{ agentId: String(parsed.agentId), prompt: String(parsed.prompt).trim() }],
          isSequential: false,
        };
      }
    } catch {
      // ignore
    }
    return { inputTasks: [], isSequential: false };
  }, [_args]);

  const subAgentData = useMemo(() => {
    if (!output?.trim()) return null;
    try {
      const parsed = JSON.parse(output) as {
        success?: boolean;
        output?: string;
        error?: string;
        results?: Array<{ agentId: string; success: boolean; output?: string; error?: string }>;
      };
      if (parsed?.error) return { error: parsed.error };
      return {
        success: parsed?.success,
        output: parsed?.output,
        results: Array.isArray(parsed?.results) ? parsed.results : undefined,
      };
    } catch {
      return null;
    }
  }, [output]);

  const subAgentStreamIds: string[] = toolCallId
    ? Array.isArray(subAgentStreamByToolCallId[toolCallId])
      ? subAgentStreamByToolCallId[toolCallId]
      : []
    : [];

  const expandedStreamId =
    expandedPillIndex != null ? subAgentStreamIds[expandedPillIndex] ?? null : null;
  const {
    steps: expandedSteps,
    textPreview: expandedTextPreview,
    attachments: expandedAttachments,
  } = useSubAgentStream(expandedStreamId);

  const stream0 = useSubAgentStream(subAgentStreamIds[0] ?? null);
  const stream1 = useSubAgentStream(subAgentStreamIds[1] ?? null);
  const stream2 = useSubAgentStream(subAgentStreamIds[2] ?? null);
  const stream3 = useSubAgentStream(subAgentStreamIds[3] ?? null);
  const stream4 = useSubAgentStream(subAgentStreamIds[4] ?? null);
  const allAttachments = [
    stream0.attachments ?? [],
    stream1.attachments ?? [],
    stream2.attachments ?? [],
    stream3.attachments ?? [],
    stream4.attachments ?? [],
  ].flat();
  const hasAnyFiles = allAttachments.length > 0;

  const handlePillClick = useCallback((idx: number) => {
    setExpandedPillIndex((prev) => (prev === idx ? null : idx));
  }, []);

  const hasResults =
    subAgentData &&
    !subAgentData.error &&
    ((subAgentData.results?.length ?? 0) > 0 ||
      (subAgentData.success && typeof subAgentData.output === 'string'));
  const results = subAgentData?.results ?? [];
  const singleOutput =
    subAgentData?.success &&
    typeof subAgentData.output === 'string' &&
    (results.length === 0 || (results.length === 1 && !results[0]?.output))
      ? subAgentData.output
      : undefined;
  const singleRunAgentId = inputTasks[0]?.agentId ?? '';

  const runCount = Math.max(
    subAgentStreamIds.length,
    results.length,
    singleOutput ? 1 : 0,
    inputTasks.length,
    1,
  );

  const allComplete =
    !isSubmitting &&
    (subAgentData?.error != null ||
      (hasResults && (results.length >= runCount || singleOutput != null)) ||
      (singleOutput != null && runCount <= 1));

  useEffect(() => {
    if (isExpanded && runCount >= 1 && expandedPillIndex === null) {
      setExpandedPillIndex(0);
    }
  }, [isExpanded, runCount, expandedPillIndex]);

  const hasAutoCollapsedRef = React.useRef(false);
  useEffect(() => {
    if (allComplete && expandedKey && isExpanded && !hasAutoCollapsedRef.current) {
      hasAutoCollapsedRef.current = true;
      setExpandedToolCalls((prev) => {
        const next = new Set(prev);
        next.delete(expandedKey);
        return next;
      });
    }
  }, [allComplete, expandedKey, isExpanded, setExpandedToolCalls]);

  const showApprovalBar = approvalStatus !== null;
  const isPending = approvalStatus === 'pending';

  if (subAgentData?.error) {
    return (
      <div className="my-2 w-full overflow-hidden rounded-lg border border-red-500/20 bg-red-500/5 p-3">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <XCircle className="size-5 shrink-0" aria-hidden="true" />
          <span className="text-sm">{subAgentData.error}</span>
        </div>
      </div>
    );
  }

  if (showApprovalBar && isPending) {
    return (
      <div className="my-2 flex flex-col gap-3 rounded-lg">
        <ToolApprovalBar
          onApprove={handleApprove}
          onDeny={handleDeny}
          onToggleExpand={() => {}}
          isExpanded={false}
          isSubmitting={approvalSubmitting}
          toolName={Tools.run_sub_agent}
          waitingForApprover={waitingForApprover}
          approverName={approverName}
          showExpandButton={false}
        />
      </div>
    );
  }

  const pills = Array.from({ length: runCount }, (_, idx) => {
    const streamId = subAgentStreamIds[idx] ?? null;
    const result = results[idx];
    const isFromResult = !!result;
    const isSingleRunWithOutput =
      !isFromResult && singleOutput && results.length === 0 && idx === 0;
    const agentId =
      result?.agentId ??
      (isSingleRunWithOutput ? singleRunAgentId : inputTasks[idx]?.agentId ?? '');
    const agentName = agentsMap?.[agentId]?.name ?? agentId;
    const hasResult = !!result || (isSingleRunWithOutput && singleOutput);
    const isRunning =
      !hasResult &&
      (isSequential
        ? !!streamId || (idx === 0 && isSubmitting)
        : !!streamId || isSubmitting);
    const isQueued =
      isSequential && idx > 0 && !hasResult && !streamId && isSubmitting;

    return {
      idx,
      agentId,
      agentName,
      streamId,
      result: isFromResult
        ? result
        : isSingleRunWithOutput
          ? { agentId: singleRunAgentId, success: true, output: singleOutput }
          : undefined,
      isRunning,
      isQueued,
    };
  });

  const mainRow = (
    <div className="flex flex-wrap items-center gap-2">
      <Play className="size-5 shrink-0 text-text-secondary" aria-hidden="true" />
      {hasAnyFiles && (
        <FileText
          className="size-5 shrink-0 text-text-secondary"
          aria-hidden="true"
          aria-label={localize('com_sub_agent_files' as TranslationKeys)}
          title={localize('com_sub_agent_files' as TranslationKeys)}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {pills.map(({ idx, agentName, result, isRunning, isQueued, streamId }) => {
          const PillIcon = getSubAgentIcon(idx);
          const showStopButton = isRunning && streamId;
          const handleStop = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (streamId) {
              abortStreamMutation.mutate({ streamId });
            }
          };
          return (
            <React.Fragment key={idx}>
              {isSequential && runCount > 1 && idx > 0 && (
                <ArrowRight
                  className="size-4 shrink-0 text-text-tertiary"
                  aria-hidden="true"
                  aria-label="Sequential chain"
                />
              )}
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    if (isExpanded) {
                      e.stopPropagation();
                      handlePillClick(idx);
                    }
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border border-border-light px-3 py-1.5 text-xs font-medium transition-colors',
                    'hover:bg-surface-tertiary/50',
                    isExpanded && expandedPillIndex === idx && 'ring-1 ring-border-medium bg-surface-tertiary/50',
                    isRunning && 'animate-pulse',
                    isQueued && 'opacity-60',
                  )}
                  aria-expanded={isExpanded && expandedPillIndex === idx}
                  aria-pressed={isExpanded && expandedPillIndex === idx}
                >
                  <PillIcon className="size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
                  <span className="text-text-primary">{agentName || 'Agent'}</span>
                  {result?.success && (
                    <CheckCircle className="size-3 shrink-0 text-green-500" aria-hidden="true" />
                  )}
                  {result && !result.success && (
                    <XCircle className="size-3 shrink-0 text-red-500" aria-hidden="true" />
                  )}
                  {isQueued && (
                    <Clock
                      className="size-3 shrink-0 text-text-tertiary"
                      aria-label={localize('com_sub_agent_queued' as TranslationKeys)}
                    />
                  )}
                </button>
                {showStopButton && (
                  <button
                    type="button"
                    onClick={handleStop}
                    disabled={abortStreamMutation.isPending}
                    className="inline-flex shrink-0 items-center justify-center rounded p-1 text-text-secondary transition-colors hover:bg-surface-tertiary/50 hover:text-text-primary disabled:opacity-50"
                    aria-label={localize('com_ui_stop' as TranslationKeys)}
                    title={localize('com_ui_stop' as TranslationKeys)}
                  >
                    <Square className="size-3.5 fill-current" aria-hidden="true" />
                  </button>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );

  if (!isExpanded) {
    return (
      <div
        className={cn(
          'my-2 w-full overflow-hidden rounded-lg border border-border-light bg-surface-secondary shadow-sm',
        )}
      >
        <button
          type="button"
          className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-tertiary/50"
          onClick={toggleExpand}
          aria-expanded={false}
        >
          {mainRow}
          <ChevronDown className="ml-auto size-4 shrink-0 text-text-secondary" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'my-2 w-full overflow-hidden rounded-lg border border-border-light bg-surface-secondary shadow-sm',
      )}
    >
      <div className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {mainRow}
          <button
            type="button"
            onClick={toggleExpand}
            className="ml-auto flex shrink-0 items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
            aria-label={localize('com_ui_collapse' as TranslationKeys)}
          >
            <ChevronUp className="size-4" aria-hidden="true" />
          </button>
        </div>

        {expandedPillIndex != null && pills[expandedPillIndex] && (
          <div className="mt-2 space-y-2">
            <div className="rounded-lg border border-border-light bg-surface-tertiary p-2.5">
              <SubAgentStepList
                agentName={pills[expandedPillIndex].agentName || 'Agent'}
                steps={expandedSteps}
                result={pills[expandedPillIndex].result}
                isRunning={pills[expandedPillIndex].isRunning}
                isQueued={pills[expandedPillIndex].isQueued}
                textPreview={expandedTextPreview}
                attachments={expandedAttachments}
                localize={localize}
              />
            </div>
            {hasAnyFiles && (
              <div className="rounded-lg border border-border-light bg-surface-tertiary p-2.5">
                <div className="mb-2 font-medium text-text-primary text-xs">
                  {localize('com_sub_agent_files' as TranslationKeys)}
                </div>
                <AttachmentGroup attachments={allAttachments} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
