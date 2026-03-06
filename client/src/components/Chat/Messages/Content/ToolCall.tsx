import { useMemo, useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import {
  Constants,
  ContentTypes,
  Tools,
  actionDelimiter,
  actionDomainSeparator,
} from 'librechat-data-provider';
import store from '~/store';

/** Icons for project tools */
const PROJECT_TOOL_ICONS: Partial<Record<string, React.ComponentType<{ className?: string }>>> = {
  [Tools.project_section_update]: FileEdit,
  [Tools.project_section_delete]: Trash2,
  [Tools.project_section_patch]: FileEdit,
  project_log: ListPlus,
  project_log_tail: List,
  project_log_search: Search,
  project_log_range: CalendarRange,
  [Tools.project_create]: FolderPlus,
  [Tools.project_list]: List,
  [Tools.project_archive]: Archive,
  [Tools.project_update_metadata]: FileEdit,
  [Tools.project_switch]: FolderInput,
};

/** Icons for workspace file edit tools */
const WORKSPACE_TOOL_ICONS: Partial<Record<string, React.ComponentType<{ className?: string }>>> = {
  [Tools.workspace_read_file]: FileText,
  [Tools.workspace_edit_file]: FileEdit,
  [Tools.workspace_create_file]: FilePlus,
  [Tools.workspace_delete_file]: FileX,
  [Tools.workspace_list_files]: FolderOpen,
  [Tools.workspace_glob_files]: Search,
  [Tools.workspace_send_file_to_user]: FilePlus,
  [Tools.workspace_pull_file]: FileDown,
  [Tools.list_my_files]: FolderOpen,
  [Tools.create_pdf]: FileText,
  [Tools.file_search]: FileSearch,
};

/** Icons for Coder tools */
const CODER_TOOL_ICONS: Partial<Record<string, React.ComponentType<{ className?: string }>>> = {
  [Tools.generate_code]: Code2,
  [Tools.lint]: CheckCircle,
  [Tools.run_program]: Play,
  [Tools.workspace_status]: Info,
  [Tools.workspace_init]: FolderOpen,
  [Tools.reset_workspace]: RotateCcw,
  [Tools.update_todo]: ListPlus,
  [Tools.create_plan]: ClipboardList,
  [Tools.create_brainstorm_doc]: FileText,
};

/** Icons for scheduler tools */
const SCHEDULER_TOOL_ICONS: Partial<Record<string, React.ComponentType<{ className?: string }>>> = {
  [Tools.list_schedules]: Calendar,
  [Tools.list_user_projects]: FolderOpen,
  [Tools.create_schedule]: CalendarPlus,
  [Tools.update_schedule]: CalendarCheck,
  [Tools.delete_schedule]: Trash2,
  [Tools.run_schedule]: Play,
  [Tools.list_runs]: List,
  [Tools.get_run]: FileSearch,
};

/** Icons for Google Calendar and MS 365 Calendar tools */
const CALENDAR_TOOL_ICONS: Partial<Record<string, React.ComponentType<{ className?: string }>>> = {
  calendar_list: Calendar,
  calendar_listEvents: Calendar,
  calendar_createEvent: Calendar,
  calendar_getEvent: Calendar,
  calendar_updateEvent: Calendar,
  calendar_deleteEvent: Calendar,
  calendar_respondToEvent: Calendar,
  calendar_findFreeTime: Calendar,
  'list-calendar-events': Calendar,
  'get-calendar-view': Calendar,
  'get-specific-calendar-view': Calendar,
  'list-calendar-event-instances': Calendar,
  'list-specific-calendar-events': Calendar,
  'get-calendar-event': Calendar,
  'get-specific-calendar-event': Calendar,
  'create-calendar-event': Calendar,
  'create-specific-calendar-event': Calendar,
  'update-calendar-event': Calendar,
  'update-specific-calendar-event': Calendar,
};

/** Icons for CRM tools */
const CRM_TOOL_ICONS: Partial<Record<string, React.ComponentType<{ className?: string }>>> = {
  crm_list_pipelines: List,
  crm_create_pipeline: List,
  crm_update_pipeline: List,
  crm_soft_delete_pipeline: List,
  crm_list_contacts: Plug,
  crm_create_contact: Plug,
  crm_update_contact: Plug,
  crm_get_contact: Plug,
  crm_soft_delete_contact: Plug,
  crm_list_organizations: Plug,
  crm_create_organization: Plug,
  crm_get_organization: Plug,
  crm_soft_delete_organization: Plug,
  crm_list_deals: Plug,
  crm_create_deal: Plug,
  crm_update_deal: Plug,
  crm_soft_delete_deal: Plug,
  crm_log_activity: List,
  crm_list_activities: List,
};

/** Icons for Human tools */
const HUMAN_TOOL_ICONS: Partial<Record<string, React.ComponentType<{ className?: string }>>> = {
  [Tools.human_await_response]: UserCheck,
  [Tools.human_notify_human]: Mail,
  [Tools.human_invite_to_workspace]: UserPlus,
  [Tools.human_list_workspace_members]: Users,
  [Tools.human_routing_rules_list]: List,
  [Tools.human_routing_rules_set]: ListPlus,
  [Tools.human_routing_rules_delete]: Trash2,
};

/** Icons for email tools */
const EMAIL_TOOL_ICONS: Partial<Record<string, React.ComponentType<{ className?: string }>>> = {
  send_user_email: Mail,
};

import type { TAttachment } from 'librechat-data-provider';
import {
  Plug,
  FileText,
  FileEdit,
  FilePlus,
  FileX,
  FileDown,
  FolderOpen,
  FolderPlus,
  FolderInput,
  Archive,
  ListPlus,
  List,
  Search,
  CalendarRange,
  Calendar,
  CalendarPlus,
  CalendarCheck,
  Trash2,
  Play,
  FileSearch,
  Code2,
  CheckCircle,
  AlertCircle,
  Info,
  RotateCcw,
  ClipboardList,
  UserCheck,
  UserPlus,
  UserMinus,
  Mail,
  Users,
} from 'lucide-react';
import { useLocalize, useProgress, useMCPConnectionStatus, useToolApproval } from '~/hooks';
import { useMessageContext } from '~/Providers';
import { useGetStartupConfig } from '~/data-provider';
import { AttachmentGroup } from './Parts';
import ToolCallInfo from './ToolCallInfo';
import ToolResultContainer from './ToolResultContainer';
import ToolApprovalBar from './ToolApprovalBar';
import { logger, cn, getToolDisplayName } from '~/utils';

export default function ToolCall({
  initialProgress = 0.1,
  isLast = false,
  isSubmitting,
  name,
  args: _args = '',
  output,
  attachments,
  auth,
  showAuthButton = true,
  toolCallId,
}: {
  initialProgress: number;
  isLast?: boolean;
  isSubmitting: boolean;
  name: string;
  args: string | Record<string, unknown>;
  output?: string | null;
  attachments?: TAttachment[];
  auth?: string;
  expires_at?: number;
  /** When false, do not set the OAuth overlay (first tool per server in message shows it) */
  showAuthButton?: boolean;
  toolCallId?: string;
}) {
  const localize = useLocalize();
  const { conversationId, messageId } = useMessageContext();
  const setPendingMCPOAuth = useSetRecoilState(store.pendingMCPOAuthAtom);
  const expandedToolCalls = useRecoilValue(store.expandedToolCallsAtom);
  const setExpandedToolCalls = useSetRecoilState(store.expandedToolCallsAtom);
  const { pendingMatches, approvalStatus, handleApprove, handleDeny, approvalSubmitting, waitingForApprover, approverName } =
    useToolApproval(toolCallId, output ?? '');
  const { data: startupConfig } = useGetStartupConfig();

  const expandedKey =
    conversationId && messageId && toolCallId
      ? `${conversationId}:${messageId}:${toolCallId}`
      : null;
  const [localShowInfo, setLocalShowInfo] = useState(false);
  const showInfo = expandedKey
    ? expandedToolCalls.has(expandedKey)
    : localShowInfo;

  const toggleShowInfo = useCallback(() => {
    if (expandedKey) {
      setExpandedToolCalls((prev) => {
        const next = new Set(prev);
        if (next.has(expandedKey)) next.delete(expandedKey);
        else next.add(expandedKey);
        return next;
      });
    } else {
      setLocalShowInfo((prev) => !prev);
    }
  }, [expandedKey, setExpandedToolCalls]);

  const interfaceConfig = startupConfig?.interface as
    | { toolCallSpacing?: 'normal' | 'compact'; toolCallDetails?: boolean }
    | undefined;
  const isCompactSpacing = interfaceConfig?.toolCallSpacing === 'compact';
  const toolCallDetailsEnabled = interfaceConfig?.toolCallDetails !== false;
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | undefined>(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevShowInfoRef = useRef<boolean>(showInfo);

  const { function_name, domain, isMCPToolCall, mcpServerName } = useMemo(() => {
    if (typeof name !== 'string') {
      return { function_name: '', domain: null, isMCPToolCall: false, mcpServerName: '' };
    }
    if (name.includes(Constants.mcp_delimiter)) {
      const parts = name.split(Constants.mcp_delimiter);
      const server = parts.pop();
      const func = parts.join(Constants.mcp_delimiter);
      return {
        function_name: func || '',
        domain: server && (server.replaceAll(actionDomainSeparator, '.') || null),
        isMCPToolCall: true,
        mcpServerName: server || '',
      };
    }
    const [func, _domain] = name.includes(actionDelimiter)
      ? name.split(actionDelimiter)
      : [name, ''];
    return {
      function_name: func || '',
      domain: _domain && (_domain.replaceAll(actionDomainSeparator, '.') || null),
      isMCPToolCall: false,
      mcpServerName: '',
    };
  }, [name]);

  const displayName = useMemo(() => (name ? getToolDisplayName(name) : ''), [name]);
  const humanizedDisplayName = displayName;

  const lintData = useMemo(() => {
    if (function_name !== Tools.lint || !output?.trim().startsWith('{')) {
      return null;
    }
    try {
      const parsed = JSON.parse(output) as { hasErrors?: boolean; errors?: unknown[] };
      const hasErrors = parsed.hasErrors === true;
      const count = Array.isArray(parsed.errors) ? parsed.errors.length : 0;
      return { hasErrors, count };
    } catch {
      return null;
    }
  }, [function_name, output]);

  const ToolIcon = useMemo(() => {
    if (function_name === Tools.lint && lintData?.hasErrors) {
      return AlertCircle;
    }
    if (function_name && PROJECT_TOOL_ICONS[function_name]) {
      return PROJECT_TOOL_ICONS[function_name] as React.ComponentType<{ className?: string }>;
    }
    if (function_name && WORKSPACE_TOOL_ICONS[function_name]) {
      return WORKSPACE_TOOL_ICONS[function_name] as React.ComponentType<{ className?: string }>;
    }
    if (function_name && SCHEDULER_TOOL_ICONS[function_name]) {
      return SCHEDULER_TOOL_ICONS[function_name] as React.ComponentType<{ className?: string }>;
    }
    if (function_name && CALENDAR_TOOL_ICONS[function_name]) {
      return CALENDAR_TOOL_ICONS[function_name] as React.ComponentType<{ className?: string }>;
    }
    if (function_name && CRM_TOOL_ICONS[function_name]) {
      return CRM_TOOL_ICONS[function_name] as React.ComponentType<{ className?: string }>;
    }
    if (function_name && CODER_TOOL_ICONS[function_name]) {
      return CODER_TOOL_ICONS[function_name] as React.ComponentType<{ className?: string }>;
    }
    if (function_name && HUMAN_TOOL_ICONS[function_name]) {
      return HUMAN_TOOL_ICONS[function_name] as React.ComponentType<{ className?: string }>;
    }
    if (function_name && EMAIL_TOOL_ICONS[function_name]) {
      return EMAIL_TOOL_ICONS[function_name] as React.ComponentType<{ className?: string }>;
    }
    return Plug;
  }, [function_name, lintData?.hasErrors]);

  const inlinePattern = useMemo(() => {
    if (function_name !== Tools.search_user_files && function_name !== Tools.workspace_glob_files) {
      return '';
    }
    try {
      const parsed = typeof _args === 'string' ? JSON.parse(_args) : _args;
      const pattern = parsed?.pattern;
      return typeof pattern === 'string' ? pattern : '';
    } catch {
      return '';
    }
  }, [_args, function_name]);

  const error =
    typeof output === 'string' && output.toLowerCase().includes('error processing tool');

  const args = useMemo(() => {
    if (typeof _args === 'string') {
      return _args;
    }
    try {
      return JSON.stringify(_args, null, 2);
    } catch (e) {
      logger.error(
        'client/src/components/Chat/Messages/Content/ToolCall.tsx - Failed to stringify args',
        e,
      );
      return '';
    }
  }, [_args]) as string | undefined;

  const isToolSearch =
    name === Constants.TOOL_SEARCH ||
    (typeof name === 'string' && name.startsWith('tool_search_mcp_'));
  const hasInfo = useMemo(
    () =>
      (args?.length ?? 0) > 0 ||
      (output?.length ?? 0) > 0 ||
      isToolSearch,
    [args, output, isToolSearch],
  );
  const hasOutput = output != null && output !== '';

  // Auto-expand generate_code when streaming so user sees the stream output
  useEffect(() => {
    if (
      expandedKey &&
      function_name === Tools.generate_code &&
      isSubmitting &&
      !hasOutput &&
      hasInfo
    ) {
      setExpandedToolCalls((prev) => (prev.has(expandedKey) ? prev : new Set(prev).add(expandedKey)));
    }
  }, [expandedKey, function_name, isSubmitting, hasOutput, hasInfo, setExpandedToolCalls]);

  const resolvedServerName = useMemo(() => {
    if (mcpServerName) return mcpServerName;
    if (!auth) return '';
    try {
      const url = new URL(auth);
      const redirectUri = url.searchParams.get('redirect_uri') || '';
      const match = redirectUri.match(/\/api\/mcp\/([^/]+)\/oauth\/callback/);
      return match?.[1] || '';
    } catch {
      return '';
    }
  }, [auth, mcpServerName]);

  const { connectionStatus } = useMCPConnectionStatus({
    enabled: !!(mcpServerName || auth),
  });
  const isServerConnected =
    !!resolvedServerName &&
    connectionStatus?.[resolvedServerName]?.connectionState === 'connected';

  const hasArgs =
    (typeof _args === 'string' && _args.trim() !== '') ||
    (typeof _args === 'object' && _args != null && Object.keys(_args).length > 0);
  const toolSearchCompletedFallback = isToolSearch && !hasOutput && hasArgs;

  const authDomain = useMemo(() => {
    const authURL = auth ?? '';
    if (!authURL) {
      return '';
    }
    try {
      const url = new URL(authURL);
      return url.hostname;
    } catch (e) {
      logger.error(
        'client/src/components/Chat/Messages/Content/ToolCall.tsx - Failed to parse auth URL',
        e,
      );
      return '';
    }
  }, [auth]);

  const actionId = useMemo(() => {
    if (!auth || isMCPToolCall) return undefined;
    try {
      const url = new URL(auth);
      const redirectUri = url.searchParams.get('redirect_uri') || '';
      const match = redirectUri.match(/\/api\/actions\/([^/]+)\/oauth\/callback/);
      return match?.[1];
    } catch {
      return undefined;
    }
  }, [auth, isMCPToolCall]);

  // When loading a conversation from API after refresh, the overlay atom is reset.
  // Set it when we render a tool that has auth and no output (still pending).
  // Only auto-show during active submission; skip for historical messages to avoid repeated prompts.
  // Skip when server is already connected (MCP) to avoid overlay after user completed OAuth.
  const needsAuth =
    (resolvedServerName || actionId) &&
    auth &&
    !hasOutput &&
    !isServerConnected;
  useEffect(() => {
    if (!showAuthButton || !needsAuth) {
      // Clear overlay if this tool was the one that set it (e.g. tool completed, hasOutput became true)
      setPendingMCPOAuth((prev) => (prev?.toolName === name ? null : prev));
      return;
    }
    // Only auto-show overlay during active submission, not when loading history
    if (!isSubmitting) return;
    setPendingMCPOAuth({
      authUrl: auth,
      toolName: name,
      ...(resolvedServerName && { serverName: resolvedServerName }),
      ...(actionId && { actionId }),
    });
  }, [
    showAuthButton,
    auth,
    hasOutput,
    resolvedServerName,
    actionId,
    name,
    setPendingMCPOAuth,
    needsAuth,
    isSubmitting,
  ]);

  const progress = useProgress(initialProgress);

  // Grace period: when stream ends (isSubmitting=false) before output arrives during live streaming,
  // avoid false "Cancelled" due to race with on_run_step_completed. Wait 3s for completion event.
  // For loaded messages (!isSubmitting from mount), treat incomplete tools as cancelled immediately.
  const [gracePeriodActive, setGracePeriodActive] = useState(false);
  const gracePeriodStartedRef = useRef(false);
  const prevIsSubmittingRef = useRef(isSubmitting);
  useEffect(() => {
    if (prevIsSubmittingRef.current && !isSubmitting && !hasOutput && progress < 1) {
      if (!gracePeriodStartedRef.current) {
        gracePeriodStartedRef.current = true;
        setGracePeriodActive(true);
        const t = setTimeout(() => setGracePeriodActive(false), 3000);
        return () => clearTimeout(t);
      }
    }
    if (hasOutput) {
      gracePeriodStartedRef.current = false;
      setGracePeriodActive(false);
    }
    prevIsSubmittingRef.current = isSubmitting;
  }, [isSubmitting, hasOutput, progress]);

  // Never show cancelled when we have successful output; show error state for tool errors.
  // For loaded messages (!isSubmitting), incomplete tools are cancelled immediately (no grace period).
  // During live streaming, cancel only after grace period expires.
  const wouldBeCancelled =
    error === true || (hasOutput ? false : !isSubmitting && progress < 1 && !gracePeriodActive);
  const cancelled = isToolSearch ? false : wouldBeCancelled;
  // When cancelled, use displayProgress=1 so we show "Cancelled" state (no spinner)
  const displayProgress =
    hasOutput ||
    (isToolSearch && wouldBeCancelled) ||
    toolSearchCompletedFallback ||
    cancelled
      ? 1
      : progress;

  const labelWithPattern = useMemo(
    () => (inlinePattern ? `${displayName} '${inlinePattern}'` : displayName),
    [displayName, inlinePattern],
  );

  const DIFF_TOOLS = useMemo(
    () =>
      new Set([
        Tools.generate_code,
        Tools.run_program,
        Tools.workspace_edit_file,
        Tools.workspace_create_file,
      ]),
    [],
  );

  const { resultsCount, summaryText } = useMemo(() => {
    if (function_name === Tools.create_brainstorm_doc) {
      return { resultsCount: undefined, summaryText: 'Brainstorm Doc' };
    }
    if (function_name === Tools.create_plan) {
      if (output?.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(output) as { items?: unknown[]; error?: string };
          if (parsed.error) {
            return { resultsCount: undefined, summaryText: 'Plan' };
          }
          const count = Array.isArray(parsed.items) ? parsed.items.length : undefined;
          return {
            resultsCount: count,
            summaryText: count != null ? `Plan — ${count} item${count !== 1 ? 's' : ''}` : 'Plan',
          };
        } catch {
          // fall through
        }
      }
      return { resultsCount: undefined, summaryText: 'Plan' };
    }
    if (function_name === Tools.lint && lintData) {
      const text = lintData.hasErrors
        ? `Lint (${lintData.count} error${lintData.count !== 1 ? 's' : ''})`
        : 'Lint (passed)';
      return { resultsCount: undefined, summaryText: text };
    }
    if (function_name === Tools.workspace_pull_file && output) {
      let filename = '';
      if (output.startsWith('Error:')) {
        return { resultsCount: undefined, summaryText: 'Pull File' };
      }
      try {
        const parsed = JSON.parse(output) as { filename?: string };
        filename = parsed.filename ?? '';
      } catch {
        const match = output.match(/Pulled (.+?) into workspace/);
        filename = match?.[1] ?? '';
      }
      return {
        resultsCount: undefined,
        summaryText: filename ? `${filename}` : 'Pull File to Workspace',
      };
    }
    if (function_name === Tools.workspace_read_file && (args || output)) {
      let filename = '';
      let lineRange = '';
      try {
        const inputParsed = JSON.parse(args || '{}') as {
          path?: string;
          start_line?: number;
          end_line?: number;
        };
        const pathVal = inputParsed.path;
        if (typeof pathVal === 'string') {
          filename = pathVal.split(/[/\\]/).pop() ?? pathVal;
        }
        if (typeof inputParsed.start_line === 'number' && typeof inputParsed.end_line === 'number') {
          lineRange = ` · ${inputParsed.start_line}–${inputParsed.end_line}`;
        } else if (typeof inputParsed.start_line === 'number') {
          lineRange = ` · ${inputParsed.start_line}`;
        }
      } catch {
        // ignore
      }
      return {
        resultsCount: undefined,
        summaryText: filename ? `Read File · ${filename}${lineRange}` : 'Read File',
      };
    }
    if (DIFF_TOOLS.has(function_name) && output?.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(output) as { file?: string; summary?: string; error?: string };
        if (parsed.error) {
          return { resultsCount: undefined, summaryText: parsed.file ? `${parsed.file}` : displayName };
        }
        const file = parsed.file ?? '';
        const summary = parsed.summary ?? '';
        const text = file && summary ? `${file} · ${summary}` : file || summary || displayName;
        return { resultsCount: undefined, summaryText: text };
      } catch {
        // fall through
      }
    }
    const base = labelWithPattern || humanizedDisplayName || localize('com_assistants_running_action');
    if (!output || typeof output !== 'string') {
      return { resultsCount: undefined, summaryText: base };
    }
    const trimmed = output.trim();
    let count: number | undefined;
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as { total?: number; results?: unknown[] };
        if (typeof parsed.total === 'number') count = parsed.total;
        else if (Array.isArray(parsed.results)) count = parsed.results.length;
      } catch {
        // ignore
      }
    } else {
      const toonTotal = trimmed.match(/\btotal\s*[:=]\s*(\d+)/im);
      if (toonTotal?.[1]) count = parseInt(toonTotal[1], 10);
      else if (/\bresults\s*\[/im.test(trimmed)) {
        const resultsMatch = trimmed.match(/results\s*\[\s*(\d+)\s*\]/im);
        if (resultsMatch) count = parseInt(resultsMatch[1], 10) + 1;
      }
    }
    const text = count != null ? `${base} — ${count} result${count !== 1 ? 's' : ''}` : base;
    return { resultsCount: count, summaryText: text };
  }, [
    function_name,
    output,
    args,
    displayName,
    DIFF_TOOLS,
    labelWithPattern,
    humanizedDisplayName,
    localize,
    lintData,
  ]);

  const isTasksTool = function_name?.startsWith('tasks_') || function_name?.startsWith('tasks.');

  const getFinishedText = () => {
    if (cancelled) {
      return localize('com_ui_cancelled');
    }
    if (function_name === Tools.search_user_files || function_name === Tools.workspace_glob_files || isTasksTool) {
      return labelWithPattern;
    }
    if (domain != null && domain && domain.length !== Constants.ENCODED_DOMAIN_LENGTH) {
      return domain;
    }
    return labelWithPattern;
  };

  useLayoutEffect(() => {
    if (showInfo !== prevShowInfoRef.current) {
      prevShowInfoRef.current = showInfo;
      setIsAnimating(true);

      if (showInfo && contentRef.current) {
        requestAnimationFrame(() => {
          if (contentRef.current) {
            const height = contentRef.current.scrollHeight;
            setContentHeight(height + 4);
          }
        });
      } else {
        setContentHeight(0);
      }

      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, 400);

      return () => clearTimeout(timer);
    }
  }, [showInfo]);

  useEffect(() => {
    if (!contentRef.current) {
      return;
    }
    const resizeObserver = new ResizeObserver((entries) => {
      if (showInfo && !isAnimating) {
        for (const entry of entries) {
          if (entry.target === contentRef.current) {
            setContentHeight(entry.contentRect.height + 4);
          }
        }
      }
    });
    resizeObserver.observe(contentRef.current);
    return () => {
      resizeObserver.disconnect();
    };
  }, [showInfo, isAnimating]);

  if (!isLast && (!function_name || function_name.length === 0) && !output) {
    return null;
  }

  const showApprovalBar = approvalStatus !== null;
  const isPending = approvalStatus === 'pending';
  const useToolResultLayout = !showApprovalBar || !isPending;

  return (
    <>
      <div
        className={cn(
          'relative flex flex-col rounded-lg',
          isCompactSpacing ? 'my-0.5' : 'my-1',
          showApprovalBar ? 'gap-3' : 'gap-1',
          cancelled && 'bg-red-500/5 dark:bg-red-950/10',
        )}
      >
        {showApprovalBar && isPending ? (
          <div
            className={cn(
              'flex shrink-0 items-center',
              isCompactSpacing ? 'gap-1' : 'gap-1.5',
              'min-h-8 flex-wrap',
            )}
          >
            <ToolApprovalBar
              onApprove={handleApprove}
              onDeny={handleDeny}
              onToggleExpand={toggleShowInfo}
              isExpanded={showInfo}
              isSubmitting={approvalSubmitting}
              toolName={name}
              resolved={
                approvalStatus === 'approved' ? 'approved' : approvalStatus === 'denied' ? 'denied' : undefined
              }
              waitingForApprover={waitingForApprover}
              approverName={approverName}
              showExpandButton={toolCallDetailsEnabled}
            />
          </div>
        ) : useToolResultLayout ? (
          <ToolResultContainer
            icon={<ToolIcon className="size-5 shrink-0 text-text-secondary" aria-hidden="true" />}
            summary={
              cancelled
                ? localize('com_ui_cancelled')
                : !hasOutput && authDomain.length > 0
                  ? localize('com_ui_requires_auth')
                  : summaryText
            }
            resultsCount={resultsCount}
            isExpanded={showInfo}
            onToggle={toggleShowInfo}
            isLoading={isSubmitting && !hasOutput}
            error={cancelled || (function_name === Tools.lint && !!lintData?.hasErrors)}
            hasExpandableContent={hasInfo && toolCallDetailsEnabled}
            minExpandHeight={120}
          >
            {hasInfo && toolCallDetailsEnabled && (
              <ToolCallInfo
                key="tool-call-info"
                input={args ?? ''}
                output={output}
                domain={authDomain || (domain ?? '')}
                function_name={function_name}
                displayName={labelWithPattern}
                pendingAuth={authDomain.length > 0 && !cancelled && displayProgress < 1}
                attachments={attachments}
              />
            )}
          </ToolResultContainer>
        ) : null}
      </div>
      {showApprovalBar && isPending && (
        <div
          className={cn('relative', isCompactSpacing ? 'pl-2' : 'pl-4')}
          style={{
            height: showInfo ? contentHeight : 0,
            overflow: 'hidden',
            transition:
              'height 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            opacity: showInfo ? 1 : 0,
            transformOrigin: 'top',
            willChange: 'height, opacity',
            perspective: '1000px',
            backfaceVisibility: 'hidden',
            WebkitFontSmoothing: 'subpixel-antialiased',
          }}
        >
          <div
            className={cn(
              'overflow-hidden rounded-xl border border-border-light bg-surface-secondary shadow-md',
              showInfo && 'shadow-lg',
              cancelled && 'bg-red-500/5 dark:bg-red-950/10',
            )}
            style={{
              transform: showInfo ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
              opacity: showInfo ? 1 : 0,
              transition:
                'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <div ref={contentRef}>
              {showInfo && hasInfo && toolCallDetailsEnabled && (
                <ToolCallInfo
                  key="tool-call-info"
                  input={args ?? ''}
                  output={output}
                  domain={authDomain || (domain ?? '')}
                  function_name={function_name}
                  displayName={labelWithPattern}
                  pendingAuth={authDomain.length > 0 && !cancelled && displayProgress < 1}
                  attachments={attachments}
                />
              )}
            </div>
          </div>
        </div>
      )}
      {attachments && attachments.length > 0 && <AttachmentGroup attachments={attachments} />}
    </>
  );
}
