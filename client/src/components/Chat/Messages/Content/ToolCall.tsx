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

/** Friendly display names for built-in tools */
const TOOL_DISPLAY_NAMES: Partial<Record<string, string>> = {
  [Tools.search_user_files]: 'Grepped',
  [Tools.workspace_glob_files]: 'Globbed',
  [Constants.TOOL_SEARCH]: 'Discovery',
  // Google Workspace MCP tools (underscore notation)
  'tasks_listTaskLists': 'Listing Google Task Lists',
  'tasks_getTaskList': 'Getting Google Task List',
  'tasks_createTaskList': 'Creating Google Task List',
  'tasks_updateTaskList': 'Updating Google Task List',
  'tasks_deleteTaskList': 'Deleting Google Task List',
  'tasks_listTasks': 'Listing Google Tasks',
  'tasks_getTask': 'Getting Google Task',
  'tasks_createTask': 'Creating Google Task',
  'tasks_updateTask': 'Updating Google Task',
  'tasks_deleteTask': 'Deleting Google Task',
  'tasks_clearCompletedTasks': 'Clearing Completed Google Tasks',
  'tasks_moveTask': 'Moving Google Task',
};
import type { TAttachment } from 'librechat-data-provider';
import { useLocalize, useProgress, useMCPConnectionStatus, useToolApproval } from '~/hooks';
import { useMessageContext } from '~/Providers';
import { useGetStartupConfig } from '~/data-provider';
import { AttachmentGroup } from './Parts';
import ToolCallInfo from './ToolCallInfo';
import ProgressText from './ProgressText';
import ToolApprovalBar from './ToolApprovalBar';
import { logger, cn } from '~/utils';

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
  const { pendingMatches, handleApprove, handleDeny, approvalSubmitting } = useToolApproval(toolCallId);
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
    | { toolCallSpacing?: 'normal' | 'compact' }
    | undefined;
  const isCompactSpacing = interfaceConfig?.toolCallSpacing === 'compact';
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

  const displayName = useMemo(
    () => (function_name && TOOL_DISPLAY_NAMES[function_name]) ?? function_name ?? '',
    [function_name],
  );

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

  return (
    <>
      <div
        className={cn(
          'relative flex flex-col',
          isCompactSpacing ? 'my-0.5' : 'my-1',
          pendingMatches ? 'gap-3' : 'gap-1',
        )}
      >
        <div
          className={cn(
            'flex shrink-0 items-center',
            isCompactSpacing ? 'gap-1' : 'gap-1.5',
            pendingMatches ? 'min-h-8 flex-wrap' : 'h-5',
          )}
        >
          {pendingMatches ? (
            <ToolApprovalBar
              onApprove={handleApprove}
              onDeny={handleDeny}
              onToggleExpand={toggleShowInfo}
              isExpanded={showInfo}
              isSubmitting={approvalSubmitting}
              toolName={name}
            />
          ) : (
            <ProgressText
              muted
              progress={displayProgress}
              onClick={toggleShowInfo}
              inProgressText={labelWithPattern || localize('com_assistants_running_action')}
              authText={
                !cancelled && authDomain.length > 0 ? localize('com_ui_requires_auth') : undefined
              }
              finishedText={getFinishedText()}
              hasInput={hasInfo}
              isExpanded={showInfo}
              error={cancelled}
            />
          )}
        </div>
      </div>
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
          )}
          style={{
            transform: showInfo ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
            opacity: showInfo ? 1 : 0,
            transition:
              'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <div ref={contentRef}>
            {showInfo && hasInfo && (
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
      {attachments && attachments.length > 0 && <AttachmentGroup attachments={attachments} />}
    </>
  );
}
