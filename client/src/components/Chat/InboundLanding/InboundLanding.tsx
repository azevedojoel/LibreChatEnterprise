import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { Button, CircleHelpIcon, TooltipAnchor, useToastContext } from '@librechat/client';
import { Mail, MessageSquare, ScrollText, Users } from 'lucide-react';
import type { TUserProject } from 'librechat-data-provider';
import store from '~/store';
import {
  useConversationsInfiniteQuery,
  useGetWorkspaceMeQuery,
  useGetWorkspaceMeMembersQuery,
  useProjectSectionsQuery,
  useProjectLogQuery,
} from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { useGetAgentsConfig } from '~/hooks/Agents';
import CollapsibleWidget from '../Dashboard/CollapsibleWidget';
import { cn } from '~/utils';

const INBOUND_HELP_HINT_ID = 'inboundHelp';

type InboundLandingProps = {
  project: TUserProject;
};

function SectionCard({
  title,
  icon: Icon,
  children,
  storageKey,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  storageKey: string;
}) {
  return (
    <CollapsibleWidget title={title} storageKey={storageKey}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0 text-text-secondary" aria-hidden />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </CollapsibleWidget>
  );
}

export default function InboundLanding({ project }: InboundLandingProps) {
  const { user } = useAuthContext();
  const localize = useLocalize();
  const navigate = useNavigate();
  const { showToast } = useToastContext();
  const setSelectedProjectId = useSetRecoilState(store.selectedProjectIdAtom);
  const [dismissedHelpHints, setDismissedHelpHints] = useRecoilState(
    store.dismissedHelpHintsAtom,
  );
  const { agentsConfig } = useGetAgentsConfig();
  const [isCopying, setIsCopying] = useState(false);

  const { data: workspaceMeData } = useGetWorkspaceMeQuery({ enabled: !!user });
  const { data: membersData } = useGetWorkspaceMeMembersQuery({
    enabled: !!workspaceMeData?.workspace,
  });
  const { data: sectionsData } = useProjectSectionsQuery(project._id);
  const { data: logData } = useProjectLogQuery(project._id, 10);
  const { data: convosData } = useConversationsInfiniteQuery(
    {
      userProjectId: project._id,
      limit: 5,
      sortBy: 'updatedAt',
      sortDirection: 'desc',
    },
    { enabled: !!project._id },
  );

  const workspace = workspaceMeData?.workspace ?? null;
  const displayDomain =
    agentsConfig?.inboundEmailDisplayDomain ?? agentsConfig?.inboundEmailAddress;
  const fullEmail = useMemo(() => {
    if (!displayDomain || !workspace?.slug) return '';
    return `${workspace.slug}@${displayDomain}`;
  }, [displayDomain, workspace?.slug]);

  const members = useMemo(() => membersData?.members ?? [], [membersData]);
  const sections = useMemo(() => sectionsData?.sections ?? [], [sectionsData]);
  const logEntries = useMemo(() => logData?.entries ?? [], [logData]);
  const conversations = useMemo(() => {
    const pages = convosData?.pages ?? [];
    return pages.flatMap((p) => p.conversations ?? []).slice(0, 5);
  }, [convosData]);

  const handleCopy = useCallback(async () => {
    if (!fullEmail || isCopying) return;
    setIsCopying(true);
    try {
      await navigator.clipboard.writeText(fullEmail);
      showToast({ message: localize('com_ui_copied_to_clipboard') });
    } catch {
      showToast({ message: localize('com_agents_link_copy_failed'), status: 'error' });
    } finally {
      setTimeout(() => setIsCopying(false), 3000);
    }
  }, [fullEmail, isCopying, showToast, localize]);

  const handleStartConversation = useCallback(() => {
    setSelectedProjectId(project._id);
    navigate('/c/new', { state: { focusChat: true } });
  }, [navigate, project._id, setSelectedProjectId]);

  const handleInboundHelp = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!dismissedHelpHints.includes(INBOUND_HELP_HINT_ID)) {
        setDismissedHelpHints([...dismissedHelpHints, INBOUND_HELP_HINT_ID]);
      }
      setSelectedProjectId(project._id);
      navigate('/c/new?autoStarter=inbound', { state: { focusChat: true } });
    },
    [dismissedHelpHints, setDismissedHelpHints, setSelectedProjectId, project._id, navigate],
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4 px-4 pb-16 xl:max-w-4xl">
      <div className="mb-2 text-center">
        <div className="group flex items-center justify-center gap-1">
          <h1 className="text-xl font-medium text-text-primary sm:text-2xl">
            {localize('com_ui_inbound_landing_title')}
          </h1>
          <TooltipAnchor
            description={localize('com_ui_inbound_help')}
            side="top"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleInboundHelp(e);
            }}
            render={
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className={cn(
                  'size-6 shrink-0 rounded p-0',
                  dismissedHelpHints.includes(INBOUND_HELP_HINT_ID)
                    ? 'opacity-0 group-hover:opacity-100'
                    : 'opacity-100',
                )}
                aria-label={localize('com_ui_inbound_help')}
              >
                <CircleHelpIcon className="size-3.5" />
              </Button>
            }
          />
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          {localize('com_ui_inbound_landing_subtitle')}
        </p>
      </div>

      <SectionCard
        title={localize('com_ui_inbound_landing_email')}
        icon={Mail}
        storageKey="inbound-email"
      >
        {fullEmail ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-surface-secondary px-2 py-1 text-sm text-text-primary">
                {fullEmail}
              </code>
              <Button
                onClick={handleCopy}
                disabled={isCopying}
                className="shrink-0"
                variant="outline"
                size="sm"
              >
                {isCopying ? localize('com_ui_copied_to_clipboard') : localize('com_ui_copy')}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">
            {localize('com_ui_dashboard_email_ellis_configure')}
          </p>
        )}
      </SectionCard>

      <SectionCard
        title={localize('com_ui_inbound_landing_users')}
        icon={Users}
        storageKey="inbound-users"
      >
        {members.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {members.map((m) => (
              <li
                key={m._id}
                className="flex items-center gap-2 text-sm text-text-primary"
              >
                <span className="truncate">{m.name || m.email || m.username || m._id}</span>
                {m.email && (
                  <span className="truncate text-text-secondary">({m.email})</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">{localize('com_ui_no_users')}</p>
        )}
      </SectionCard>

      <SectionCard
        title={localize('com_ui_inbound_landing_rules')}
        icon={ScrollText}
        storageKey="inbound-rules"
      >
        {sections.length > 0 ? (
          <div className="space-y-3">
            {sections.map((s) => (
              <div key={s.sectionId} className="rounded bg-surface-secondary/50 p-2">
                <h4 className="text-xs font-medium text-text-secondary">{s.title}</h4>
                <pre className="mt-1 whitespace-pre-wrap break-words text-sm text-text-primary">
                  {s.content || ''}
                </pre>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">
            {localize('com_ui_inbound_landing_no_rules')}
          </p>
        )}
      </SectionCard>

      <SectionCard
        title={localize('com_ui_inbound_landing_log')}
        icon={ScrollText}
        storageKey="inbound-log"
      >
        {logEntries.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {logEntries.map((entry, i) => (
              <li
                key={i}
                className="flex flex-col gap-0.5 rounded bg-surface-secondary/50 px-2 py-1 text-xs"
              >
                <span className="text-text-secondary">
                  {entry.timestamp
                    ? new Date(entry.timestamp).toLocaleString()
                    : ''}
                </span>
                <span className="text-text-primary">{entry.entry}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">
            {localize('com_ui_inbound_landing_no_log')}
          </p>
        )}
      </SectionCard>

      <SectionCard
        title={localize('com_ui_inbound_landing_conversations')}
        icon={MessageSquare}
        storageKey="inbound-conversations"
      >
        {conversations.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {conversations.map((convo) => (
              <li key={convo.conversationId}>
                <Link
                  to={`/c/${convo.conversationId}`}
                  className={cn(
                    'block truncate text-sm text-text-primary underline underline-offset-2',
                    'decoration-text-secondary/50 hover:text-accent-primary hover:decoration-accent-primary',
                  )}
                >
                  {convo.title || localize('com_ui_dashboard_email_ellis_convo_fallback')}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">
            {localize('com_ui_inbound_landing_no_conversations')}
          </p>
        )}
      </SectionCard>

      <div className="mt-4 flex justify-center">
        <Button onClick={handleStartConversation} size="lg">
          {localize('com_ui_inbound_landing_start_chat')}
        </Button>
      </div>
    </div>
  );
}
