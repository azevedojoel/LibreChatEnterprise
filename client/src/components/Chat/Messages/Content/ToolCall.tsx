import { useMemo, useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
  Constants,
  Tools,
  actionDelimiter,
  actionDomainSeparator,
} from 'librechat-data-provider';

/** Friendly display names for built-in tools */
const TOOL_DISPLAY_NAMES: Partial<Record<string, string>> = {
  [Tools.search_user_files]: 'Grepped',
  [Tools.workspace_glob_files]: 'Globbed',
  [Constants.TOOL_SEARCH]: 'Discovery',
  // Google Tasks tools (underscore: default, dot: --use-dot-names)
  tasks_listTaskLists: 'List Task Lists',
  'tasks.listTaskLists': 'List Task Lists',
  tasks_getTaskList: 'Get Task List',
  'tasks.getTaskList': 'Get Task List',
  tasks_createTaskList: 'Create Task List',
  'tasks.createTaskList': 'Create Task List',
  tasks_updateTaskList: 'Update Task List',
  'tasks.updateTaskList': 'Update Task List',
  tasks_deleteTaskList: 'Delete Task List',
  'tasks.deleteTaskList': 'Delete Task List',
  tasks_listTasks: 'List Tasks',
  'tasks.listTasks': 'List Tasks',
  tasks_getTask: 'Get Task',
  'tasks.getTask': 'Get Task',
  tasks_createTask: 'Create Task',
  'tasks.createTask': 'Create Task',
  tasks_updateTask: 'Update Task',
  'tasks.updateTask': 'Update Task',
  tasks_deleteTask: 'Delete Task',
  'tasks.deleteTask': 'Delete Task',
  tasks_clearCompletedTasks: 'Clear Completed Tasks',
  'tasks.clearCompletedTasks': 'Clear Completed Tasks',
  tasks_moveTask: 'Move Task',
  'tasks.moveTask': 'Move Task',
  // HubSpot tools
  hubspot_contacts_list: 'List Contacts',
  hubspot_contacts_get: 'Get Contact',
  hubspot_contacts_search: 'Search Contacts',
  hubspot_contacts_create: 'Create Contact',
  hubspot_contacts_update: 'Update Contact',
  hubspot_companies_list: 'List Companies',
  hubspot_companies_get: 'Get Company',
  hubspot_companies_search: 'Search Companies',
  hubspot_companies_create: 'Create Company',
  hubspot_companies_update: 'Update Company',
  hubspot_deals_list: 'List Deals',
  hubspot_deals_get: 'Get Deal',
  hubspot_deals_search: 'Search Deals',
  hubspot_deals_create: 'Create Deal',
  hubspot_deals_update: 'Update Deal',
  hubspot_tickets_list: 'List Tickets',
  hubspot_tickets_get: 'Get Ticket',
  hubspot_tickets_search: 'Search Tickets',
  hubspot_tickets_create: 'Create Ticket',
  hubspot_tickets_update: 'Update Ticket',
  hubspot_list_associations: 'List Associations',
  hubspot_create_association: 'Create Association',
  hubspot_create_note: 'Create Note',
  hubspot_create_task: 'Create Task',
  hubspot_get_engagement: 'Get Engagement',
  hubspot_auth_clear: 'Clear Auth',
};
import type { TAttachment } from 'librechat-data-provider';
import { useLocalize, useProgress } from '~/hooks';
import { useGetStartupConfig } from '~/data-provider';
import { AttachmentGroup } from './Parts';
import ToolCallInfo from './ToolCallInfo';
import ProgressText from './ProgressText';
import AuthCTA from './AuthCTA';
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
}) {
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();
  const interfaceConfig = startupConfig?.interface as
    | { toolCallDetails?: boolean; toolCallSpacing?: 'normal' | 'compact' }
    | undefined;
  const toolCallDetails = interfaceConfig?.toolCallDetails !== false;
  const isCompactSpacing = interfaceConfig?.toolCallSpacing === 'compact';
  const [showInfo, setShowInfo] = useState(false);
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

  const hasInfo = useMemo(
    () => (args?.length ?? 0) > 0 || (output?.length ?? 0) > 0,
    [args, output],
  );
  const isToolSearch =
    name === Constants.TOOL_SEARCH ||
    (typeof name === 'string' && name.startsWith('tool_search_mcp_'));
  /** tool_search always shows expandable content so users can see query and results */
  const canExpand = toolCallDetails && (hasInfo || isToolSearch);
  const hasOutput = output != null && output !== '';
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

  const progress = useProgress(initialProgress);

  // Grace period: when stream ends (isSubmitting=false) before output arrives, avoid false
  // "Cancelled" due to race with on_run_step_completed. Wait 3s for completion event.
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

  // Never show cancelled when we have successful output; show error state for tool errors;
  // show cancelled only when stream ended without completion and no output, and grace period expired
  const wouldBeCancelled =
    error === true || (hasOutput ? false : !isSubmitting && progress < 1 && !gracePeriodActive);
  const cancelled = isToolSearch ? false : wouldBeCancelled;
  const displayProgress =
    hasOutput || (isToolSearch && wouldBeCancelled) || toolSearchCompletedFallback ? 1 : progress;

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
          'relative flex h-5 shrink-0 items-center',
          isCompactSpacing ? 'my-0.5 gap-1' : 'my-1 gap-1.5',
        )}
      >
        <ProgressText
          muted
          progress={displayProgress}
          onClick={undefined}
          inProgressText={labelWithPattern || localize('com_assistants_running_action')}
          authText={
            !cancelled && authDomain.length > 0 ? localize('com_ui_requires_auth') : undefined
          }
          finishedText={getFinishedText()}
          hasInput={false}
          isExpanded={showInfo}
          error={cancelled}
        />
      </div>
      {false && (
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
            {showInfo && canExpand && (
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
      {auth != null && auth && displayProgress < 1 && !cancelled && (
        <AuthCTA auth={auth} name={name} />
      )}
      {attachments && attachments.length > 0 && <AttachmentGroup attachments={attachments} />}
    </>
  );
}
