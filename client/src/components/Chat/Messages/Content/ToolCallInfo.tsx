import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@librechat/client';
import { CheckCircle, Circle, ExternalLink, Loader2 } from 'lucide-react';
import cronstrue from 'cronstrue';
import { useLocalize, type TranslationKeys } from '~/hooks';
import useOpenInArtifact from '~/hooks/Artifacts/useOpenInArtifact';
import { Tools } from 'librechat-data-provider';
import { UIResourceRenderer } from '@mcp-ui/client';
import UIResourceCarousel from './UIResourceCarousel';
import { RunScheduleNowWidget } from './RunScheduleNowWidget';
import MarkdownLite from './MarkdownLite';
import { cn, humanizeToolName } from '~/utils';
import type { TAttachment, UIResource } from 'librechat-data-provider';

const PROMPT_TRUNCATE_LENGTH = 200;

function parsePlanToItems(planContent: string): Array<{ item: string; status: string }> {
  const lines = planContent.split(/\r?\n/);
  const items: Array<{ item: string; status: string }> = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const unchecked = trimmed.match(/^[-*]\s+\[[\s ]\]\s+(.+)$/);
    const checked = trimmed.match(/^[-*]\s+\[[xX]\]\s+(.+)$/);
    const plain = trimmed.match(/^[-*]\s+(.+)$/);
    if (unchecked) {
      items.push({ item: unchecked[1].trim(), status: 'pending' });
    } else if (checked) {
      items.push({ item: checked[1].trim(), status: 'complete' });
    } else if (plain && !trimmed.startsWith('---')) {
      items.push({ item: plain[1].trim(), status: 'pending' });
    }
  }
  return items;
}

function extractPlanMeta(planContent: string): { title: string; summary: string } {
  const lines = planContent.split(/\r?\n/);
  let title = '';
  const summaryLines: string[] = [];
  let foundTitle = false;
  let inSummary = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const h1 = trimmed.match(/^#\s+(.+)$/);
    const h2 = trimmed.match(/^##\s+(.+)$/);
    const listOrHr = /^[-*]\s|^---/.test(trimmed);
    if (h1 && !foundTitle) {
      title = h1[1].trim();
      foundTitle = true;
      inSummary = true;
      continue;
    }
    if (!foundTitle && h2) {
      title = h2[1].trim();
      foundTitle = true;
      inSummary = true;
      continue;
    }
    if ((h2 && foundTitle) || listOrHr) {
      inSummary = false;
      break;
    }
    if (inSummary) {
      summaryLines.push(trimmed);
    }
  }
  const raw = summaryLines.join(' ').trim();
  const summary = raw.length > 280 ? `${raw.slice(0, 280).trim()}…` : raw;
  return { title: title || 'Plan', summary: summary || '' };
}

function humanizeCron(cronExpression: string): string {
  try {
    return cronstrue.toString(cronExpression);
  } catch {
    return cronExpression;
  }
}

const SCHEDULER_TOOLS = new Set<string>([
  Tools.list_schedules,
  Tools.list_user_projects,
  Tools.create_schedule,
  Tools.update_schedule,
  Tools.delete_schedule,
  Tools.run_schedule,
  Tools.list_runs,
  Tools.get_run,
]);

const DIFF_TOOLS = new Set<string>([
  Tools.generate_code,
  Tools.run_program,
  Tools.workspace_create_file,
  Tools.workspace_edit_file,
]);

const HUMAN_TOOLS = new Set<string>([
  Tools.human_list_workspace_members,
  Tools.human_routing_rules_list,
  Tools.human_routing_rules_set,
  Tools.human_routing_rules_delete,
  Tools.human_notify_human,
  Tools.human_await_response,
  Tools.human_invite_to_workspace,
  Tools.human_remove_from_workspace,
]);

function formatSchedulerTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

type SchedulerInputPreview =
  | {
      type: 'create';
      name: string;
      agentId?: string;
      prompt?: string;
      scheduleType?: string;
      cronExpression?: string;
      runAt?: string;
      timezone?: string;
      userProjectId?: string;
    }
  | {
      type: 'update';
      scheduleId: string;
      name?: string;
      agentId?: string;
      prompt?: string;
      scheduleType?: string;
      cronExpression?: string;
      runAt?: string;
      enabled?: boolean;
      timezone?: string;
      userProjectId?: string;
    };

function SchedulePreviewCard({
  preview,
  localize,
  formatSchedulerTimeFn,
}: {
  preview: SchedulerInputPreview;
  localize: (key: TranslationKeys | string, vars?: Record<string, unknown>) => string;
  formatSchedulerTimeFn: (iso: string) => string;
}) {
  const promptDisplay =
    typeof preview.prompt === 'string' && preview.prompt.length > PROMPT_TRUNCATE_LENGTH
      ? `${preview.prompt.slice(0, PROMPT_TRUNCATE_LENGTH)}...`
      : (preview.prompt ?? '');

  let whenDisplay: string;
  if (preview.scheduleType === 'one-off' && preview.runAt) {
    whenDisplay = formatSchedulerTimeFn(preview.runAt);
  } else if (preview.scheduleType === 'recurring' && preview.cronExpression) {
    whenDisplay = humanizeCron(preview.cronExpression);
  } else {
    whenDisplay = preview.cronExpression ?? '—';
  }

  if (preview.type === 'update') {
    const fields: Array<{ label: string; value: string | undefined }> = [];
    if (preview.name != null)
      fields.push({
        label: localize('com_scheduler_preview_name' as TranslationKeys),
        value: preview.name,
      });
    if (preview.prompt != null)
      fields.push({
        label: localize('com_sidepanel_scheduled_agents_prompt'),
        value:
          preview.prompt.length > PROMPT_TRUNCATE_LENGTH
            ? `${preview.prompt.slice(0, PROMPT_TRUNCATE_LENGTH)}...`
            : preview.prompt,
      });
    if (preview.scheduleType != null)
      fields.push({
        label: localize('com_sidepanel_scheduled_agents_schedule_type'),
        value:
          preview.scheduleType === 'one-off'
            ? localize('com_sidepanel_scheduled_agents_one_off')
            : localize('com_sidepanel_scheduled_agents_recurring'),
      });
    if (preview.cronExpression != null)
      fields.push({
        label: localize('com_sidepanel_scheduled_agents_custom_cron'),
        value: humanizeCron(preview.cronExpression),
      });
    if (preview.runAt != null)
      fields.push({
        label: localize('com_sidepanel_scheduled_agents_run_at'),
        value: formatSchedulerTimeFn(preview.runAt),
      });
    if (preview.enabled != null)
      fields.push({
        label: localize('com_scheduler_preview_enabled' as TranslationKeys),
        value: preview.enabled
          ? localize('com_sidepanel_scheduled_agents_upcoming')
          : localize('com_sidepanel_scheduled_agents_paused'),
      });
    if (preview.timezone != null)
      fields.push({
        label: localize('com_sidepanel_scheduled_agents_timezone'),
        value: preview.timezone,
      });

    return (
      <div className="rounded-lg border border-border-light bg-surface-tertiary p-3 text-sm">
        <div className="mb-2 font-medium text-text-primary">
          {localize('com_scheduler_preview_updating' as TranslationKeys, { 0: preview.scheduleId })}
        </div>
        {fields.length === 0 ? (
          <div className="text-text-secondary">
            {localize('com_scheduler_preview_no_changes' as TranslationKeys)}
          </div>
        ) : (
          <div className="space-y-1.5">
            {fields.map(({ label, value }) =>
              value ? (
                <div key={label} className="flex gap-2 text-xs">
                  <span className="shrink-0 font-medium text-text-secondary">{label}:</span>
                  <span className="min-w-0 break-words text-text-primary" title={value}>
                    {value}
                  </span>
                </div>
              ) : null,
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-light bg-surface-tertiary p-3 text-sm">
      <div className="font-medium text-text-primary">{preview.name}</div>
      <div className="mt-2 space-y-1.5 text-xs">
        {preview.agentId && (
          <div className="flex gap-2">
            <span className="shrink-0 font-medium text-text-secondary">
              {localize('com_scheduler_preview_agent' as TranslationKeys)}:
            </span>
            <span className="min-w-0 truncate font-mono text-text-primary">{preview.agentId}</span>
          </div>
        )}
        {promptDisplay && (
          <div className="flex flex-col gap-0.5">
            <span className="shrink-0 font-medium text-text-secondary">
              {localize('com_sidepanel_scheduled_agents_prompt')}:
            </span>
            <p className="min-w-0 break-words text-text-primary" title={preview.prompt ?? ''}>
              {promptDisplay}
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-text-secondary">
            {preview.scheduleType === 'one-off'
              ? localize('com_sidepanel_scheduled_agents_one_off')
              : localize('com_sidepanel_scheduled_agents_recurring')}
          </span>
          <span className="text-text-secondary">
            {localize('com_scheduler_preview_when' as TranslationKeys)}: {whenDisplay}
          </span>
          <span className="text-text-secondary">
            {localize('com_sidepanel_scheduled_agents_timezone')}: {preview.timezone}
          </span>
        </div>
        {preview.userProjectId && (
          <div className="mt-1 text-text-secondary">
            {localize('com_scheduler_preview_project' as TranslationKeys)}: {preview.userProjectId}
          </div>
        )}
      </div>
    </div>
  );
}

function SchedulerStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: 'bg-green-500/20 text-green-600 dark:text-green-400',
    failed: 'bg-red-500/20 text-red-600 dark:text-red-400',
    running: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
    queued: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
    pending: 'bg-gray-500/20 text-gray-600 dark:text-gray-400',
  };
  const isActive = status === 'queued' || status === 'running';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium',
        colors[status] ?? 'bg-gray-500/20',
      )}
    >
      {isActive && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
      {status}
    </span>
  );
}

function OptimizedCodeBlock({ text, maxHeight = 320 }: { text: string; maxHeight?: number }) {
  return (
    <div
      className="rounded-lg bg-surface-tertiary p-2 text-xs text-text-primary"
      style={{
        position: 'relative',
        maxHeight,
        overflow: 'auto',
      }}
    >
      <pre className="m-0 whitespace-pre-wrap break-words" style={{ overflowWrap: 'break-word' }}>
        <code>{text}</code>
      </pre>
    </div>
  );
}

const DIFF_PREVIEW_LINES = 40;

function DiffView({
  diff,
  summary,
  file,
  maxLines = DIFF_PREVIEW_LINES,
}: {
  diff: string;
  summary?: string;
  file?: string;
  maxLines?: number;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const lines = diff.split('\n');
  const isTruncated = lines.length > maxLines && !expanded;
  const displayLines = isTruncated ? lines.slice(0, maxLines) : lines;
  const remainingCount = lines.length - maxLines;

  return (
    <div className="rounded-lg border border-border-light bg-surface-tertiary overflow-hidden">
      {(summary || file) && (
        <div className="rounded-t-lg bg-surface-secondary px-2 py-1.5 text-xs text-text-secondary">
          {file && <span className="font-mono">{file}</span>}
          {summary && file && ' · '}
          {summary}
        </div>
      )}
      <div
        className="overflow-auto p-2 font-mono text-xs"
        style={{ maxHeight: 320 }}
      >
        {displayLines.map((line, i) => {
          const isAdd = line.startsWith('+') && !line.startsWith('+++');
          const isRemove = line.startsWith('-') && !line.startsWith('---');
          return (
            <div
              key={i}
              className={`whitespace-pre ${isAdd ? 'bg-green-500/10 text-green-700 dark:text-green-400' : ''} ${isRemove ? 'bg-red-500/10 text-red-600 dark:text-red-400' : ''} ${!isAdd && !isRemove ? 'text-text-secondary' : ''}`}
            >
              {line}
            </div>
          );
        })}
        {isTruncated && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-2 text-sm text-text-secondary hover:text-text-primary underline"
          >
            Show {remainingCount} more lines
          </button>
        )}
      </div>
    </div>
  );
}

function FileListRow({
  filename,
  path,
  count,
}: {
  filename: string;
  path: string;
  count?: number;
}) {
  const ext = filename.includes('.') ? (filename.split('.').pop()?.toLowerCase() ?? '') : '';
  const dir = path.includes('/') ? path.replace(/\/[^/]+$/, '') : path.replace(/\\[^\\]+$/, '');
  return (
    <div className="flex items-center gap-2 py-1 text-xs">
      <span className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded bg-surface-tertiary px-1 font-mono text-[10px] font-medium text-text-secondary">
        {ext || '?'}
      </span>
      <span className="min-w-0 shrink-0 truncate font-medium text-text-primary">{filename}</span>
      {dir ? (
        <span className="min-w-0 truncate text-text-secondary" title={dir}>
          {dir}
        </span>
      ) : null}
      {count != null && (
        <span className="ml-auto shrink-0 rounded bg-surface-tertiary px-1.5 py-0.5 text-text-secondary">
          {count}
        </span>
      )}
    </div>
  );
}

function LineNumberedBlock({
  content,
  startLine = 1,
  maxHeight = 320,
}: {
  content: string;
  startLine?: number;
  maxHeight?: number;
}) {
  const lines = content.split(/\r?\n/);
  const padWidth = String(startLine + lines.length - 1).length;
  return (
    <div
      className="rounded-lg border border-border-light bg-surface-tertiary overflow-hidden font-mono text-xs text-text-primary"
      style={{ maxHeight }}
    >
      <div className="overflow-auto p-2" style={{ maxHeight }}>
        {lines.map((line, i) => (
          <div key={i} className="flex gap-3 whitespace-pre">
            <span
              className="shrink-0 select-none text-right text-text-secondary"
              style={{ minWidth: padWidth }}
            >
              {startLine + i}
            </span>
            <span className="min-w-0 break-words">{line || ' '}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ToolCallInfo({
  input,
  output,
  domain,
  function_name,
  displayName,
  pendingAuth,
  attachments,
}: {
  input: string;
  function_name: string;
  displayName?: string;
  output?: string | null;
  domain?: string;
  pendingAuth?: boolean;
  attachments?: TAttachment[];
}) {
  const localize = useLocalize();
  const formatText = (text: string) => {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  };

  const nameForTitle = displayName ?? function_name;
  const isGreppedOrGlobbed =
    function_name === Tools.search_user_files || function_name === Tools.workspace_glob_files;
  let title: string;
  if (domain != null && domain) {
    title = localize('com_assistants_domain_info', { 0: domain });
  } else if (isGreppedOrGlobbed) {
    title = nameForTitle;
  } else {
    title = localize('com_assistants_function_use', { 0: nameForTitle });
  }
  if (pendingAuth === true) {
    title =
      domain != null && domain
        ? localize('com_assistants_action_attempt', { 0: domain })
        : localize('com_assistants_attempt_info');
  }

  const uiResources: UIResource[] =
    attachments
      ?.filter((attachment) => attachment.type === Tools.ui_resources)
      .flatMap((attachment) => {
        return attachment[Tools.ui_resources] as UIResource[];
      }) ?? [];

  const openInArtifact = useOpenInArtifact();

  const pullFileData = useMemo(() => {
    if (function_name !== Tools.workspace_pull_file || !output) {
      return null;
    }
    if (output.startsWith('Error:')) {
      return { error: output.replace(/^Error:\s*/, '') };
    }
    try {
      const parsed = JSON.parse(output) as { filename?: string; message?: string };
      if (typeof parsed.filename === 'string') {
        return { filename: parsed.filename, message: parsed.message };
      }
    } catch {
      // fallback: plain string
    }
    const match = output.match(/Pulled (.+?) into workspace/);
    if (match) {
      return { filename: match[1], message: output };
    }
    return null;
  }, [function_name, output]);

  const readFileData = useMemo(() => {
    if (function_name !== Tools.workspace_read_file || !output) {
      return null;
    }
    if (output.startsWith('Error:')) {
      return { error: output.replace(/^Error:\s*/, '') };
    }
    let content: string | undefined;
    let filename = 'file';
    let startLine: number | undefined;
    let endLine: number | undefined;
    try {
      const parsed = JSON.parse(output) as { content?: string; error?: string };
      if (typeof parsed.content === 'string' && parsed.content.length > 0) {
        content = parsed.content;
      }
      if (parsed.error) {
        return { error: parsed.error };
      }
    } catch {
      // output is plain content
      content = output;
    }
    try {
      const inputParsed = JSON.parse(input || '{}') as {
        path?: string;
        relativePath?: string;
        start_line?: number;
        end_line?: number;
      };
      const pathVal = inputParsed.path ?? inputParsed.relativePath;
      if (typeof pathVal === 'string') {
        filename = pathVal.split(/[/\\]/).pop() ?? filename;
      }
      if (typeof inputParsed.start_line === 'number') {
        startLine = inputParsed.start_line;
      }
      if (typeof inputParsed.end_line === 'number') {
        endLine = inputParsed.end_line;
      }
    } catch {
      // use defaults
    }
    if (content != null) {
      return { content, filename, startLine, endLine };
    }
    return null;
  }, [function_name, output, input]);

  const projectReadData = useMemo(() => {
    if (function_name !== 'project_read' || !output) {
      return null;
    }
    try {
      const parsed = JSON.parse(output) as { context?: string; error?: string };
      if (typeof parsed.error === 'string' && parsed.error.length > 0) {
        return { error: parsed.error };
      }
      if (typeof parsed.context === 'string') {
        return { context: parsed.context };
      }
    } catch {
      // output is not valid JSON
    }
    return null;
  }, [function_name, output]);

  const [planViewExpanded, setPlanViewExpanded] = useState(false);

  const planData = useMemo(() => {
    if (function_name !== Tools.create_plan) return null;
    try {
      if (output?.trim().startsWith('{')) {
        const parsed = JSON.parse(output) as {
          plan?: string;
          items?: Array<{ item: string; status: string }>;
          error?: string;
        };
        if (parsed.error) return { error: parsed.error };
        if (typeof parsed.plan === 'string' && parsed.plan.length > 0) {
          return { plan: parsed.plan, items: parsed.items ?? [] };
        }
      }
      const inputParsed = typeof input === 'string' ? JSON.parse(input || '{}') : input;
      const planContent = inputParsed?.plan_content;
      if (typeof planContent === 'string' && planContent.length > 0) {
        const items = parsePlanToItems(planContent);
        return { plan: planContent, items };
      }
    } catch {
      // fallback: try input only
      try {
        const inputParsed = typeof input === 'string' ? JSON.parse(input || '{}') : input;
        const planContent = inputParsed?.plan_content;
        if (typeof planContent === 'string') {
          return { plan: planContent, items: parsePlanToItems(planContent) };
        }
      } catch {
        // ignore
      }
    }
    return null;
  }, [function_name, output, input]);

  const lintData = useMemo(() => {
    if (function_name !== Tools.lint || !output?.trim().startsWith('{')) {
      return null;
    }
    try {
      const parsed = JSON.parse(output) as {
        hasErrors?: boolean;
        errors?: string[];
        lastLintedPath?: string;
      };
      const hasErrors = parsed.hasErrors === true;
      const errors = Array.isArray(parsed.errors) ? parsed.errors : [];
      const lastLintedPath = typeof parsed.lastLintedPath === 'string' ? parsed.lastLintedPath : '';
      return { hasErrors, errors, lastLintedPath };
    } catch {
      return null;
    }
  }, [function_name, output]);

  const searchFilesData = useMemo(() => {
    if (function_name !== Tools.search_user_files || !output) {
      return null;
    }
    if (output.startsWith('Error:') || output === 'No matches found.') {
      return null;
    }
    const countByPath = new Map<string, number>();
    for (const line of output.split('\n')) {
      const match = line.match(/^(.+):\d+:/);
      if (match) {
        const path = match[1];
        countByPath.set(path, (countByPath.get(path) ?? 0) + 1);
      }
    }
    return Array.from(countByPath.entries())
      .map(([path, count]) => ({
        path,
        filename: path.split(/[/\\]/).pop() ?? path,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [function_name, output]);

  const globFilesData = useMemo(() => {
    if (function_name !== Tools.workspace_glob_files || !output) {
      return null;
    }
    if (output.startsWith('Error:') || output === 'No files found.') {
      return null;
    }
    return output
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((path) => ({
        path,
        filename: path.split(/[/\\]/).pop() ?? path,
      }));
  }, [function_name, output]);

  /** generate_code streaming: show Stream Output when waiting for or receiving raw LLM text (before final JSON with diff) */
  const streamingCodeData = useMemo(() => {
    if (function_name !== Tools.generate_code) {
      return null;
    }
    // Already have final JSON (diff or error) - let diffData handle it
    if (output && output.trim().length > 0) {
      try {
        const parsed = JSON.parse(output) as { diff?: string; error?: string };
        if (parsed && typeof parsed === 'object' && ('diff' in parsed || 'error' in parsed)) {
          return null;
        }
      } catch {
        /* output is not JSON - streaming raw text */
      }
    }
    // Show Stream Output: empty (waiting) or raw streaming text
    return { content: output ?? '' };
  }, [function_name, output]);

  const streamOutputRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (streamingCodeData && streamOutputRef.current) {
      streamOutputRef.current.scrollTop = streamOutputRef.current.scrollHeight;
    }
  }, [streamingCodeData?.content]);

  const diffData = useMemo(() => {
    if (!DIFF_TOOLS.has(function_name) || !output) {
      return null;
    }
    try {
      const parsed = JSON.parse(output) as {
        diff?: string | null;
        summary?: string;
        file?: string;
        error?: string;
        output?: string;
        lint?: { hasErrors?: boolean; errors?: string[]; summary?: string };
        model?: string;
        provider?: string;
      };
      if (parsed.error) {
        return {
          error: parsed.error,
          file: parsed.file,
          model: parsed.model,
          provider: parsed.provider,
        };
      }
      const lint = parsed.lint;
      const base = {
        diff: typeof parsed.diff === 'string' && parsed.diff.length > 0 ? parsed.diff : undefined,
        summary: parsed.summary,
        file: parsed.file,
        output: typeof parsed.output === 'string' ? parsed.output : undefined,
        ...(lint && { lint }),
        ...(parsed.model && { model: parsed.model }),
        ...(parsed.provider && { provider: parsed.provider }),
      };
      if (base.diff || parsed.file || parsed.summary) {
        return base;
      }
    } catch {
      // output is not valid JSON
    }
    return null;
  }, [function_name, output]);

  const schedulerData = useMemo(() => {
    if (!function_name || !SCHEDULER_TOOLS.has(function_name) || !output) {
      return null;
    }
    try {
      const parsed = JSON.parse(output);
      if (function_name === Tools.list_schedules) {
        if (parsed?.error) return { error: parsed.error };
        return { schedules: Array.isArray(parsed) ? parsed : [] };
      }
      if (function_name === Tools.list_user_projects) {
        if (parsed?.error) return { error: parsed.error };
        const projects = parsed?.projects ?? [];
        return {
          projects: Array.isArray(projects) ? projects : [],
          nextCursor: parsed?.nextCursor,
        };
      }
      if (function_name === Tools.create_schedule || function_name === Tools.update_schedule) {
        if (parsed?.error) return { error: parsed.error };
        return { schedule: parsed };
      }
      if (function_name === Tools.delete_schedule) {
        if (parsed?.error) return { error: parsed.error };
        return { success: parsed?.success === true };
      }
      if (function_name === Tools.run_schedule) {
        if (parsed?.error) return { error: parsed.error };
        return {
          success: parsed?.success,
          runId: parsed?.runId,
          status: parsed?.status,
          conversationId: parsed?.conversationId,
        };
      }
      if (function_name === Tools.list_runs) {
        if (parsed?.error) return { error: parsed.error };
        return { runs: Array.isArray(parsed) ? parsed : [] };
      }
      if (function_name === Tools.get_run) {
        if (parsed?.error) return { error: parsed.error };
        return { run: parsed };
      }
    } catch {
      // fall through to default JSON display
    }
    return null;
  }, [function_name, output]);

  const schedulerInputSummary = useMemo(() => {
    if (!function_name || !SCHEDULER_TOOLS.has(function_name)) return null;
    if (input?.trim()) {
      try {
        const parsed = JSON.parse(input);
        if (function_name === Tools.create_schedule && parsed?.name) {
          return localize('com_scheduler_input_creating' as TranslationKeys, {
            0: parsed.name,
            1: parsed.scheduleType ?? 'recurring',
          });
        }
        if (function_name === Tools.update_schedule && parsed?.scheduleId) {
          return localize('com_scheduler_input_updating' as TranslationKeys, {
            0: parsed.scheduleId,
          });
        }
        if (function_name === Tools.delete_schedule && parsed?.scheduleId) {
          return localize('com_scheduler_input_deleting' as TranslationKeys, {
            0: parsed.scheduleId,
          });
        }
        if (function_name === Tools.run_schedule && parsed?.scheduleId) {
          return localize('com_scheduler_input_running' as TranslationKeys, {
            0: parsed.scheduleId,
          });
        }
        if (function_name === Tools.get_run && parsed?.runId) {
          return localize('com_scheduler_input_fetching' as TranslationKeys, { 0: parsed.runId });
        }
      } catch {
        // fall through
      }
    }
    if (function_name === Tools.list_user_projects) {
      return localize('com_scheduler_input_listing_projects' as TranslationKeys);
    }
    if (function_name === Tools.list_schedules) {
      return localize('com_scheduler_input_listing_schedules' as TranslationKeys);
    }
    if (function_name === Tools.list_runs) {
      return localize('com_scheduler_input_listing_runs' as TranslationKeys);
    }
    return null;
  }, [function_name, input, localize]);

  const schedulerInputPreviewData = useMemo(() => {
    if (
      (function_name !== Tools.create_schedule && function_name !== Tools.update_schedule) ||
      !input?.trim()
    ) {
      return null;
    }
    try {
      const parsed = JSON.parse(input);
      if (function_name === Tools.create_schedule && parsed?.name) {
        return {
          type: 'create' as const,
          name: parsed.name,
          agentId: parsed.agentId,
          prompt: parsed.prompt,
          scheduleType: parsed.scheduleType ?? 'recurring',
          cronExpression: parsed.cronExpression,
          runAt: parsed.runAt,
          timezone: parsed.timezone ?? 'UTC',
          userProjectId: parsed.userProjectId,
        };
      }
      if (function_name === Tools.update_schedule && parsed?.scheduleId) {
        return {
          type: 'update' as const,
          scheduleId: parsed.scheduleId,
          name: parsed.name,
          agentId: parsed.agentId,
          prompt: parsed.prompt,
          scheduleType: parsed.scheduleType,
          cronExpression: parsed.cronExpression,
          runAt: parsed.runAt,
          enabled: parsed.enabled,
          timezone: parsed.timezone,
          userProjectId: parsed.userProjectId,
        };
      }
    } catch {
      // fall through
    }
    return null;
  }, [function_name, input]);

  const humanToolData = useMemo(() => {
    if (!function_name || !HUMAN_TOOLS.has(function_name)) return null;
    const argLabels: Record<string, string> = {
      memberId: 'Recipient',
      message: 'Message',
      context: 'Context',
      trigger: 'Topic',
      recipient: 'Recipient',
      instructions: 'Instructions',
      email: 'Email',
    };
    let inputFields: Array<{ label: string; value: string }> = [];
    if (input?.trim()) {
      try {
        const parsed = JSON.parse(input) as Record<string, unknown>;
        for (const [key, val] of Object.entries(parsed)) {
          if (key.startsWith('_') || val == null) continue;
          const label = argLabels[key] ?? humanizeToolName(key);
          const value =
            typeof val === 'object' ? JSON.stringify(val) : String(val);
          if (value.trim()) {
            inputFields.push({ label, value });
          }
        }
      } catch {
        // fall through
      }
    }
    let outputSummary: string | null = null;
    if (output?.trim()) {
      const outputLower = output.toLowerCase();
      const isDeniedOutput =
        outputLower.includes('user denied') || outputLower.includes('denied execution');
      try {
        const parsed = JSON.parse(output) as Record<string, unknown>;
        if (parsed?.error && typeof parsed.error === 'string') {
          outputSummary = parsed.error;
        } else if (function_name === Tools.human_await_response) {
          if (isDeniedOutput) {
            outputSummary = 'Denied';
          } else if (parsed?.approved === true) {
            outputSummary = 'Approved';
          } else {
            outputSummary = (parsed?.message as string) ?? 'Approved';
          }
        } else if (function_name === Tools.human_notify_human) {
          outputSummary =
            (parsed?.message as string) ??
            (parsed?.emailSent ? 'Notification sent' : 'Notification queued');
        } else if (function_name === Tools.human_invite_to_workspace) {
          outputSummary =
            parsed?.error ??
            (parsed?.message as string) ??
            (parsed?.success ? 'Invitation sent' : '');
        } else if (function_name === Tools.human_remove_from_workspace) {
          outputSummary =
            parsed?.error ??
            (parsed?.message as string) ??
            (parsed?.success ? 'Member removed' : '');
        } else if (function_name === Tools.human_list_workspace_members) {
          const members = parsed?.members as Array<unknown> | undefined;
          const invites = parsed?.invites as Array<unknown> | undefined;
          const memberCount = Array.isArray(members) ? members.length : 0;
          const inviteCount = Array.isArray(invites) ? invites.length : 0;
          const parts: string[] = [];
          if (memberCount > 0) parts.push(`${memberCount} member${memberCount === 1 ? '' : 's'}`);
          if (inviteCount > 0) parts.push(`${inviteCount} invite${inviteCount === 1 ? '' : 's'}`);
          outputSummary = parts.length > 0 ? `Listed ${parts.join(', ')}` : 'No members or invites';
        } else if (
          function_name === Tools.human_routing_rules_set ||
          function_name === Tools.human_routing_rules_delete
        ) {
          outputSummary = (parsed?.message as string) ?? (parsed?.success ? 'Success' : '');
        } else if (function_name === Tools.human_routing_rules_list) {
          const rules = parsed?.rules as Array<unknown> | undefined;
          const count = Array.isArray(rules) ? rules.length : 0;
          outputSummary = count > 0 ? `Found ${count} rule${count === 1 ? '' : 's'}` : 'No rules';
        } else {
          outputSummary = (parsed?.message as string) ?? null;
        }
      } catch {
        if (function_name === Tools.human_await_response && isDeniedOutput) {
          outputSummary = 'Denied';
        } else {
          outputSummary = output;
        }
      }
    }
    return { inputFields, outputSummary };
  }, [function_name, input, output]);

  const handleOpenInArtifact = React.useCallback(() => {
    if (readFileData) {
      openInArtifact({
        content: readFileData.content,
        filename: readFileData.filename,
      });
    } else if (projectReadData && 'context' in projectReadData) {
      openInArtifact({
        content: projectReadData.context ?? '',
        filename: 'project-context.txt',
      });
    }
  }, [readFileData, projectReadData, openInArtifact]);

  const isCompactFileList =
    (searchFilesData && searchFilesData.length > 0) || (globFilesData && globFilesData.length > 0);

  // lint: compact IDE-style error list with colors
  if (lintData) {
    const { hasErrors, errors, lastLintedPath } = lintData;
    if (!hasErrors) {
      return (
        <div className="w-full p-2">
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle className="size-4 shrink-0" aria-hidden />
            <span>No lint errors.</span>
          </div>
        </div>
      );
    }
    /** Ruff format: path:line:col: CODE [*] message. Directory case may prefix with "file: ". */
    const RUFF_LINE_REGEX = /^(.+):(\d+):(\d+):\s+([A-Z]\d+)\s*(?:\[.*?\])?\s*(.*)$/;
    return (
      <div className="w-full p-2">
        {lastLintedPath && (
          <div className="mb-2 text-xs font-mono text-text-secondary">{lastLintedPath}</div>
        )}
        <ul className="space-y-1.5">
          {errors.map((line, idx) => {
            const m = line.match(RUFF_LINE_REGEX);
            if (m) {
              const [, file, lineNum, col, code, message] = m;
              const loc = `${file}:${lineNum}:${col}`;
              const isError = /^[EF]/.test(code);
              return (
                <li
                  key={idx}
                  className="flex flex-wrap items-baseline gap-2 border-l-2 border-red-500/50 pl-2 py-0.5"
                >
                  <span className="shrink-0 font-mono text-xs text-text-secondary">{loc}</span>
                  <span
                    className={cn(
                      'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                      isError
                        ? 'bg-red-500/20 text-red-600 dark:text-red-400'
                        : 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
                    )}
                  >
                    {code}
                  </span>
                  <span className="min-w-0 flex-1 text-sm text-text-primary">{message || ''}</span>
                </li>
              );
            }
            return (
              <li
                key={idx}
                className="flex items-baseline gap-2 border-l-2 border-red-500/50 pl-2 py-0.5 text-sm text-text-primary"
              >
                {line}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // create_plan: compact summary + todos, toggle for full plan
  if (planData) {
    if ('error' in planData) {
      return (
        <div className="w-full p-2">
          <div className="rounded-lg bg-red-500/10 p-2 text-sm text-red-600 dark:bg-red-950/20 dark:text-red-400">
            {planData.error}
          </div>
        </div>
      );
    }
    const { plan, items } = planData;
    const { title, summary } = extractPlanMeta(plan);
    return (
      <div className="w-full p-2">
        <div className="space-y-1.5">
          <div className="font-semibold text-sm text-text-primary">{title}</div>
          {summary && (
            <p className="text-xs leading-snug text-text-secondary">{summary}</p>
          )}
          {items.length > 0 && (
            <ul className="space-y-0.5 border-t border-border-light pt-1.5">
              {items.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-center gap-2 text-xs text-text-primary"
                >
                  {item.status === 'complete' ? (
                    <CheckCircle className="size-4 shrink-0 text-green-500" aria-hidden />
                  ) : (
                    <Circle className="size-4 shrink-0 text-text-tertiary" strokeWidth={2} aria-hidden />
                  )}
                  <span
                    className={cn(
                      'min-w-0 flex-1 [&_p]:my-0 [&_p]:inline',
                      item.status === 'complete' && 'line-through text-text-tertiary',
                    )}
                  >
                    <MarkdownLite content={item.item} codeExecution={false} />
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setPlanViewExpanded((v) => !v)}
            className="text-xs text-text-secondary underline hover:text-text-primary"
          >
            {planViewExpanded ? 'Hide details' : 'View Plan'}
          </button>
          {planViewExpanded && (
            <div className="markdown border-t border-border-light pt-1.5 text-sm text-text-primary prose dark:prose-invert light dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-headings:mb-1 prose-headings:mt-2 first:prose-headings:mt-0">
              <MarkdownLite content={plan} codeExecution={false} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // generate_code streaming: Stream Output window with auto-scroll
  if (streamingCodeData) {
    const hasContent = streamingCodeData.content.trim().length > 0;
    const displayContent = hasContent ? streamingCodeData.content : 'Waiting for response...';
    return (
      <div className="w-full p-2">
        <div className="rounded-lg border border-border-light overflow-hidden">
          <div className="rounded-t-lg border-b border-border-light bg-surface-tertiary px-2 py-1.5 text-xs font-medium text-text-secondary">
            Stream Output
          </div>
          <div
            ref={streamOutputRef}
            className="rounded-b-lg bg-surface-tertiary p-2 text-xs overflow-auto"
            style={{ maxHeight: 320 }}
          >
            <pre
              className={cn(
                'm-0 whitespace-pre-wrap break-words',
                hasContent ? 'text-text-primary' : 'text-text-tertiary italic',
              )}
              style={{ overflowWrap: 'break-word' }}
            >
              <code>{displayContent}</code>
            </pre>
          </div>
        </div>
      </div>
    );
  }

  // generate_code / run_program / workspace_edit_file / workspace_create_file: diff view
  if (diffData) {
    if ('error' in diffData) {
      const errModel = 'model' in diffData ? diffData.model : undefined;
      const errProvider = 'provider' in diffData ? diffData.provider : undefined;
      return (
        <div className="w-full p-2 space-y-2">
          {(errModel || errProvider) && function_name === Tools.generate_code && (
            <div className="rounded border border-border-light bg-surface-tertiary px-2 py-1 text-xs text-text-secondary">
              Model: {errProvider ? `${errProvider}/` : ''}{errModel ?? '—'}
            </div>
          )}
          <div className="rounded-lg bg-red-500/10 p-2 text-sm text-red-600 dark:text-red-950/20 dark:text-red-400">
            {diffData.error}
          </div>
        </div>
      );
    }

    const lint = 'lint' in diffData ? diffData.lint : undefined;
    const model = 'model' in diffData ? diffData.model : undefined;
    const provider = 'provider' in diffData ? diffData.provider : undefined;
    const ModelBadge =
      model && function_name === Tools.generate_code ? (
        <div className="mb-2 rounded border border-border-light bg-surface-tertiary px-2 py-1 text-xs text-text-secondary">
          Generated with {provider ? `${provider}/` : ''}{model}
        </div>
      ) : null;
    const LintBadge = lint ? (
      <div
        className={cn(
          'mt-2 rounded-lg border px-2 py-1.5 text-xs',
          lint.hasErrors
            ? 'border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400'
            : 'border-green-500/30 bg-green-500/5 text-green-600 dark:text-green-400',
        )}
      >
        {lint.hasErrors ? (
          <ul className="space-y-0.5">
            {lint.errors?.slice(0, 5).map((e, i) => (
              <li key={i} className="font-mono">
                {e}
              </li>
            ))}
            {(lint.errors?.length ?? 0) > 5 && (
              <li className="text-text-secondary">+{(lint.errors?.length ?? 0) - 5} more</li>
            )}
          </ul>
        ) : (
          <span>Lint: {lint.summary ?? 'No lint errors.'}</span>
        )}
      </div>
    ) : null;
    const hasMeaningfulDiff =
      diffData.diff &&
      diffData.diff !== '(no diff)' &&
      !diffData.diff.startsWith('(no diff)');
    if (hasMeaningfulDiff) {
      return (
        <div className="w-full p-2">
          {ModelBadge}
          <DiffView
            diff={diffData.diff}
            summary={diffData.summary}
            file={diffData.file}
          />
          {LintBadge}
        </div>
      );
    }
    // run_program with no diff: show success state + output
    if (function_name === Tools.run_program) {
      const runOutput = 'output' in diffData ? diffData.output : undefined;
      const runArgs =
        'args' in diffData &&
        Array.isArray(diffData.args) &&
        diffData.args.length > 0
          ? diffData.args
          : undefined;
      return (
        <div className="w-full p-2 space-y-2">
          <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-2 py-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle className="size-4 shrink-0" aria-hidden />
            <span>
              {diffData.file && <span className="font-mono">{diffData.file}</span>}
              {runArgs && (
                <>
                  {diffData.file && ' '}
                  <span className="text-text-secondary">({runArgs.join(' ')})</span>
                </>
              )}
              {diffData.summary && (
                <>
                  {(diffData.file || runArgs) && ' · '}
                  {diffData.summary}
                </>
              )}
              {!diffData.summary && diffData.file && 'Ran successfully. Committed.'}
            </span>
          </div>
          {runOutput && (
            <div className="rounded-lg border border-border-light bg-surface-tertiary px-2 py-1.5 font-mono text-xs text-text-primary whitespace-pre-wrap overflow-x-auto">
              {runOutput}
            </div>
          )}
        </div>
      );
    }
    // No diff (e.g. create new file): show summary + lint if present
    return (
      <div className="w-full p-2">
        {ModelBadge}
        <div className="rounded-lg border border-border-light bg-surface-tertiary px-2 py-1.5 text-sm text-text-primary">
          {diffData.file && <span className="font-mono">{diffData.file}</span>}
          {diffData.summary && diffData.file && ' · '}
          {diffData.summary}
        </div>
        {LintBadge}
      </div>
    );
  }

  // workspace_pull_file: compact success card with file info
  if (pullFileData) {
    if ('error' in pullFileData) {
      return (
        <div className="w-full p-2">
          <div className="rounded-lg bg-red-500/10 p-2 text-sm text-red-600 dark:bg-red-950/20 dark:text-red-400">
            {pullFileData.error}
          </div>
        </div>
      );
    }
    return (
      <div className="w-full p-2">
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-2 py-2 text-sm text-green-600 dark:text-green-400">
          <CheckCircle className="size-4 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <FileListRow filename={pullFileData.filename} path={pullFileData.filename} />
            <span className="text-xs text-text-secondary">Pulled into workspace</span>
          </div>
        </div>
      </div>
    );
  }

  // workspace_read_file: line-numbered content (filename + range shown in tool row)
  if (readFileData && !('error' in readFileData)) {
    const { content, startLine } = readFileData;
    return (
      <div className="w-full p-2 space-y-2">
        {content && (
          <LineNumberedBlock
            content={content}
            startLine={startLine ?? 1}
            maxHeight={320}
          />
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleOpenInArtifact}
          className="gap-1.5"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          {localize('com_ui_open_in_artifact')}
        </Button>
      </div>
    );
  }
  if (readFileData && 'error' in readFileData) {
    return (
      <div className="w-full p-2">
        <div className="rounded-lg bg-red-500/10 p-2 text-sm text-red-600 dark:bg-red-950/20 dark:text-red-400">
          {readFileData.error}
        </div>
      </div>
    );
  }

  // project_read: user-facing, just show context or empty (no technical labels)
  if (projectReadData) {
    let projectReadContent: React.ReactNode;
    if ('error' in projectReadData) {
      projectReadContent = (
        <div className="rounded-lg bg-red-500/10 p-2 text-sm text-red-600 dark:bg-red-950/20 dark:text-red-400">
          {projectReadData.error}
        </div>
      );
    } else if (projectReadData.context) {
      projectReadContent = (
        <>
          <div className="whitespace-pre-wrap break-words text-sm text-text-primary">
            {projectReadData.context}
          </div>
          <div className="mt-2">
            <Button variant="outline" size="sm" onClick={handleOpenInArtifact} className="gap-1.5">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {localize('com_ui_open_in_artifact')}
            </Button>
          </div>
        </>
      );
    } else {
      projectReadContent = (
        <div className="text-sm text-text-secondary">{localize('com_ui_no_project_context')}</div>
      );
    }
    return (
      <div className="w-full p-2">
        <div style={{ opacity: 1 }}>{projectReadContent}</div>
      </div>
    );
  }

  const showSchedulerInput = schedulerInputSummary && !schedulerInputSummary.startsWith('com_');
  const hasSchedulerInputPreview = schedulerInputPreviewData != null;
  const isSchedulerToolWithCustomView = !!function_name && SCHEDULER_TOOLS.has(function_name);

  if (isSchedulerToolWithCustomView) {
    let schedulerContent: React.ReactNode = null;
    const errorBlock = (msg: string) => (
      <div className="rounded-lg bg-red-500/10 p-2 text-sm text-red-600 dark:bg-red-950/20 dark:text-red-400">
        {msg}
      </div>
    );

    if (schedulerData && 'error' in schedulerData) {
      schedulerContent = errorBlock(schedulerData.error);
    } else if (schedulerData && 'schedules' in schedulerData) {
      const schedules = schedulerData.schedules as Array<{
        _id?: string;
        name?: string;
        scheduleType?: string;
        nextRunAt?: string;
        runAt?: string;
        cronExpression?: string;
        enabled?: boolean;
      }>;
      if (schedules.length === 0) {
        schedulerContent = (
          <div className="text-sm text-text-secondary">
            {localize('com_sidepanel_scheduled_agents_no_schedules')}
          </div>
        );
      } else {
        schedulerContent = (
          <div className="space-y-2">
            {schedules.map((s) => {
              const id = s._id ?? '';
              const nextRun =
                s.nextRunAt ??
                (s.scheduleType === 'one-off' && s.runAt ? formatSchedulerTime(s.runAt) : '—');
              return (
                <div
                  key={id}
                  className="rounded-lg border border-border-light bg-surface-tertiary p-2 text-xs"
                >
                  <div className="font-medium text-text-primary">{s.name ?? 'Unnamed'}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-text-secondary">
                    <span>
                      {s.scheduleType === 'one-off'
                        ? localize('com_sidepanel_scheduled_agents_one_off')
                        : localize('com_sidepanel_scheduled_agents_recurring')}
                    </span>
                    {s.enabled === false && (
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-600 dark:text-amber-400">
                        {localize('com_sidepanel_scheduled_agents_paused')}
                      </span>
                    )}
                    <span>
                      {localize('com_sidepanel_scheduled_agents_next_run')}: {nextRun}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        );
      }
    } else if (schedulerData && 'projects' in schedulerData) {
      const projects = schedulerData.projects as Array<{ _id?: string; name?: string }>;
      if (projects.length === 0) {
        schedulerContent = (
          <div className="text-sm text-text-secondary">{localize('com_ui_no_results_found')}</div>
        );
      } else {
        schedulerContent = (
          <ul className="space-y-1.5 text-sm">
            {projects.map((p, idx) => (
              <li key={p._id ?? idx} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-text-secondary">-</span>
                <span className="min-w-0 flex-1 truncate text-text-primary">
                  {p.name ?? 'Unnamed'}
                </span>
              </li>
            ))}
          </ul>
        );
      }
    } else if (schedulerData && 'schedule' in schedulerData) {
      const s = schedulerData.schedule as {
        name?: string;
        scheduleType?: string;
        nextRunAt?: string;
        runAt?: string;
        cronExpression?: string;
      };
      const nextRun =
        s.nextRunAt ??
        (s.scheduleType === 'one-off' && s.runAt ? formatSchedulerTime(s.runAt) : '—');
      schedulerContent = (
        <div className="rounded-lg border border-border-light bg-surface-tertiary p-2 text-sm">
          <div className="font-medium text-text-primary">{s.name ?? 'Schedule'}</div>
          <div className="mt-1 text-text-secondary">
            {s.scheduleType === 'one-off'
              ? localize('com_sidepanel_scheduled_agents_one_off')
              : localize('com_sidepanel_scheduled_agents_recurring')}
            {' · '}
            {localize('com_sidepanel_scheduled_agents_next_run')}: {nextRun}
          </div>
        </div>
      );
    } else if (schedulerData && 'success' in schedulerData && schedulerData.success) {
      schedulerContent = (
        <div className="text-sm text-green-600 dark:text-green-400">
          {localize('com_sidepanel_scheduled_agents_deleted')}
        </div>
      );
    } else if (schedulerData && 'runId' in schedulerData) {
      const { runId, status, conversationId } = schedulerData;
      if (runId && conversationId) {
        schedulerContent = (
          <RunScheduleNowWidget
            runId={runId}
            conversationId={conversationId}
            initialStatus={status ?? 'queued'}
          />
        );
      } else {
        schedulerContent = (
          <div className="rounded-lg border border-border-light bg-surface-tertiary p-2 text-sm">
            <div className="flex items-center gap-2">
              <SchedulerStatusBadge status={status ?? 'queued'} />
              <span className="text-text-secondary">
                {runId
                  ? `${localize('com_scheduler_run_queued' as TranslationKeys)} ${runId}`
                  : localize('com_ui_error' as TranslationKeys)}
              </span>
            </div>
            {conversationId && (
              <div className="mt-1 text-xs text-text-secondary">
                {localize('com_sidepanel_scheduled_agents_conversation_created')}
              </div>
            )}
          </div>
        );
      }
    } else if (schedulerData && 'runs' in schedulerData) {
      const runs = schedulerData.runs as Array<{
        _id?: string;
        runAt?: string;
        status?: string;
        scheduleId?: { name?: string } | string;
      }>;
      if (runs.length === 0) {
        schedulerContent = (
          <div className="text-sm text-text-secondary">
            {localize('com_sidepanel_scheduled_agents_no_recent_runs')}
          </div>
        );
      } else {
        schedulerContent = (
          <div className="space-y-2">
            {runs.map((r) => {
              const scheduleName =
                typeof r.scheduleId === 'object' && r.scheduleId?.name
                  ? r.scheduleId.name
                  : typeof r.scheduleId === 'string'
                    ? r.scheduleId
                    : 'Schedule';
              return (
                <div
                  key={r._id ?? ''}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border-light bg-surface-tertiary p-2 text-xs"
                >
                  <span className="font-medium text-text-primary">{scheduleName}</span>
                  <div className="flex items-center gap-2">
                    <SchedulerStatusBadge status={r.status ?? 'pending'} />
                    <span className="text-text-secondary">
                      {r.runAt ? formatSchedulerTime(r.runAt) : '—'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        );
      }
    } else if (schedulerData && 'run' in schedulerData) {
      const r = schedulerData.run as {
        status?: string;
        runAt?: string;
        error?: string;
        scheduleId?: { name?: string } | string;
        messages?: unknown[];
      };
      const scheduleName =
        typeof r.scheduleId === 'object' && r.scheduleId?.name
          ? r.scheduleId.name
          : typeof r.scheduleId === 'string'
            ? r.scheduleId
            : 'Schedule';
      if (r.error) {
        schedulerContent = errorBlock(r.error);
      } else {
        schedulerContent = (
          <div className="rounded-lg border border-border-light bg-surface-tertiary p-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium text-text-primary">{scheduleName}</span>
              <SchedulerStatusBadge status={r.status ?? 'pending'} />
            </div>
            <div className="mt-1 text-text-secondary">
              {localize('com_sidepanel_scheduled_agents_run_at')}:{' '}
              {r.runAt ? formatSchedulerTime(r.runAt) : '—'}
            </div>
            {r.messages && Array.isArray(r.messages) && (
              <div className="mt-1 text-xs text-text-secondary">
                {r.messages.length} {r.messages.length === 1 ? 'message' : 'messages'}
              </div>
            )}
          </div>
        );
      }
    }

    const previewOnly = hasSchedulerInputPreview && !schedulerContent;

    return (
      <div className="w-full p-2">
        <div style={{ opacity: 1 }} className="flex min-h-0 flex-col">
          {hasSchedulerInputPreview ? (
            <div className={previewOnly ? 'min-w-0 flex-1' : 'mb-2'}>
              <SchedulePreviewCard
                preview={schedulerInputPreviewData}
                localize={localize as (key: string, vars?: Record<string, unknown>) => string}
                formatSchedulerTimeFn={formatSchedulerTime}
              />
            </div>
          ) : showSchedulerInput ? (
            <div className="mb-2 rounded-lg bg-surface-tertiary p-2 text-xs text-text-secondary">
              {schedulerInputSummary}
            </div>
          ) : null}
          {schedulerContent && (
            <div className={hasSchedulerInputPreview || showSchedulerInput ? 'mt-2' : ''}>
              {schedulerContent}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Human tools: compact card with human-readable input/output
  if (humanToolData) {
    const { inputFields, outputSummary } = humanToolData;
    const hasInput = inputFields.length > 0;
    const hasOutput = outputSummary != null && outputSummary.trim() !== '';
    const isApproved =
      function_name === Tools.human_await_response &&
      outputSummary?.toLowerCase().includes('approved');
    const isDenied =
      function_name === Tools.human_await_response &&
      (outputSummary?.toLowerCase().includes('denied') ?? false);

    return (
      <div className="w-full p-2">
        <div style={{ opacity: 1 }} className="space-y-2">
          {hasInput && (
            <div className="space-y-1.5">
              {inputFields.map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-border-light bg-surface-tertiary p-2 text-sm">
                  <div className="mb-0.5 text-xs font-medium text-text-secondary">{label}</div>
                  <div className="whitespace-pre-wrap break-words text-text-primary">
                    {value.length > 500 ? `${value.slice(0, 500)}…` : value}
                  </div>
                </div>
              ))}
            </div>
          )}
          {hasOutput && (
            <div
              className={cn(
                'flex items-center gap-2 rounded-lg border px-2 py-2 text-sm',
                isApproved &&
                  'border-green-500/30 bg-green-500/5 text-green-600 dark:text-green-400',
                isDenied && 'border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400',
                !isApproved &&
                  !isDenied &&
                  'border-border-light bg-surface-tertiary text-text-primary',
              )}
            >
              {isApproved && <CheckCircle className="size-4 shrink-0" aria-hidden />}
              <span>{outputSummary}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full p-2">
      <div style={{ opacity: 1 }}>
        <div className="mb-2 text-sm font-medium text-text-primary">{title}</div>
        {!isCompactFileList && (
          <div>
            <OptimizedCodeBlock text={formatText(input)} maxHeight={250} />
          </div>
        )}
        {isCompactFileList ? (
          <div className="space-y-0.5">
            {searchFilesData?.map(({ path, filename, count }) => (
              <FileListRow key={path} filename={filename} path={path} count={count} />
            ))}
            {globFilesData?.map(({ path, filename }) => (
              <FileListRow key={path} filename={filename} path={path} />
            ))}
          </div>
        ) : (
          <>
            {output && (
              <>
                <div className="my-2 text-sm font-medium text-text-primary">
                  {localize('com_ui_result')}
                </div>
                <div>
                  <OptimizedCodeBlock text={formatText(output)} maxHeight={250} />
                </div>
                {readFileData && (
                  <div className="mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOpenInArtifact}
                      className="gap-1.5"
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      {localize('com_ui_open_in_artifact')}
                    </Button>
                  </div>
                )}
                {uiResources.length > 0 && (
                  <>
                    <div className="my-2 text-sm font-medium text-text-primary">
                      {localize('com_ui_ui_resources')}
                    </div>
                    <div>
                      {uiResources.length > 1 && <UIResourceCarousel uiResources={uiResources} />}
                      {uiResources.length === 1 && (
                        <UIResourceRenderer
                          resource={uiResources[0]}
                          onUIAction={async (result) => {
                            console.log('Action:', result);
                          }}
                          htmlProps={{
                            autoResizeIframe: { width: true, height: true },
                          }}
                        />
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
