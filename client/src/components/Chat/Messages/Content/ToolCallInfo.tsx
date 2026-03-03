import React, { useMemo } from 'react';
import { Button } from '@librechat/client';
import { ExternalLink, Loader2 } from 'lucide-react';
import cronstrue from 'cronstrue';
import { useLocalize, type TranslationKeys } from '~/hooks';
import useOpenInArtifact from '~/hooks/Artifacts/useOpenInArtifact';
import { Tools } from 'librechat-data-provider';
import { UIResourceRenderer } from '@mcp-ui/client';
import UIResourceCarousel from './UIResourceCarousel';
import { cn } from '~/utils';
import type { TAttachment, UIResource } from 'librechat-data-provider';

const PROMPT_TRUNCATE_LENGTH = 200;

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

  const readFileData = useMemo(() => {
    if (function_name !== Tools.workspace_read_file || !output) {
      return null;
    }
    try {
      const parsed = JSON.parse(output) as { content?: string; error?: string };
      if (typeof parsed.content === 'string' && parsed.content.length > 0) {
        let filename = 'file';
        try {
          const inputParsed = JSON.parse(input) as { relativePath?: string };
          if (typeof inputParsed.relativePath === 'string') {
            filename = inputParsed.relativePath.split(/[/\\]/).pop() ?? filename;
          }
        } catch {
          // use default filename
        }
        return { content: parsed.content, filename };
      }
    } catch {
      // output is not valid JSON
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
      schedulerContent = (
        <div className="rounded-lg border border-border-light bg-surface-tertiary p-2 text-sm">
          <div className="flex items-center gap-2">
            <SchedulerStatusBadge status={status ?? 'queued'} />
            <span className="text-text-secondary">
              {localize('com_scheduler_run_queued' as TranslationKeys)} {runId}
            </span>
          </div>
          {conversationId && (
            <div className="mt-1 text-xs text-text-secondary">
              {localize('com_sidepanel_scheduled_agents_conversation_created')}
            </div>
          )}
        </div>
      );
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
