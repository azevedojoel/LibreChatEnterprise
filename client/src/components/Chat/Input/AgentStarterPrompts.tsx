import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRecoilState, useRecoilValue } from 'recoil';
import { EModelEndpoint } from 'librechat-data-provider';
import { useAgentsMapContext, useChatContext } from '~/Providers';
import { useSubmitMessage } from '~/hooks';
import { useUserProjectsQuery } from '~/data-provider';
import store from '~/store';

export const PROJECTS_HELP_PROMPT =
  'Hey Ellis, please explain how projects work in Daily Thread and provide an example use case.';

export const SCHEDULES_HELP_PROMPT =
  'Hey Ellis, how do agent schedules work in Daily Thread. Provide a short, concise example.';

export const INBOUND_HELP_PROMPT =
  'Hey Ellis, what is the purpose of the inbound workspace project?';

export const PROJECT_HELP_PROMPT =
  'Hey Ellis, what is the purpose of this project?';

const MEET_AGENTS_PROMPT =
  'Hey ellis, please ask each agent of the daily thread family of agents what their name and function is then introduce yourself at the end';

type StarterItem = {
  label: string;
  text: string;
  helpHintId?: string;
  getProjectId?: () => string | null;
};

export default function AgentStarterPrompts() {
  const agentsMap = useAgentsMapContext();
  const { newConversation } = useChatContext();
  const { submitMessage } = useSubmitMessage();
  const selectedProjectId = useRecoilValue(store.selectedProjectIdAtom);
  const [dismissedHelpHints, setDismissedHelpHints] = useRecoilState(
    store.dismissedHelpHintsAtom,
  );
  const { data: projectsData } = useUserProjectsQuery({ limit: 50 });
  const submitMessageRef = useRef(submitMessage);
  submitMessageRef.current = submitMessage;

  const hasEllis = !!agentsMap?.['system-general'];

  const inboundProjectId = useMemo(() => {
    const projects = projectsData?.projects ?? [];
    return projects.find((p) => p.isInbound)?._id ?? null;
  }, [projectsData?.projects]);

  const starters: StarterItem[] = useMemo(() => {
    const items: StarterItem[] = [
      { label: 'Meet the agents', text: MEET_AGENTS_PROMPT },
      {
        label: "What's a project?",
        text: PROJECTS_HELP_PROMPT,
        helpHintId: 'projectsHelp',
      },
      {
        label: 'Scheduled what?',
        text: SCHEDULES_HELP_PROMPT,
        helpHintId: 'schedulesHelp',
      },
    ];
    if (inboundProjectId) {
      items.push({
        label: "What's inbound?",
        text: INBOUND_HELP_PROMPT,
        helpHintId: 'inboundHelp',
        getProjectId: () => inboundProjectId,
      });
    }
    return items;
  }, [inboundProjectId]);

  const handlePromptClick = useCallback(
    (item: StarterItem) => {
      if (!hasEllis) return;
      if (item.helpHintId && !dismissedHelpHints.includes(item.helpHintId)) {
        setDismissedHelpHints([...dismissedHelpHints, item.helpHintId]);
      }
      const userProjectId = item.getProjectId?.() ?? null;
      newConversation({
        template: {
          endpoint: EModelEndpoint.agents,
          agent_id: 'system-general',
          ...(userProjectId && { userProjectId }),
        },
      });
      setTimeout(() => submitMessageRef.current?.({ text: item.text }), 150);
    },
    [
      hasEllis,
      newConversation,
      dismissedHelpHints,
      setDismissedHelpHints,
      inboundProjectId,
    ],
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const autoStarterHandledRef = useRef(false);
  useEffect(() => {
    if (autoStarterHandledRef.current || !hasEllis) return;
    const autoStarter = searchParams.get('autoStarter');
    if (
      autoStarter !== 'projects' &&
      autoStarter !== 'schedules' &&
      autoStarter !== 'inbound' &&
      autoStarter !== 'project'
    )
      return;
    autoStarterHandledRef.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete('autoStarter');
    setSearchParams(next, { replace: true });
    const prompt =
      autoStarter === 'schedules'
        ? SCHEDULES_HELP_PROMPT
        : autoStarter === 'inbound'
          ? INBOUND_HELP_PROMPT
          : autoStarter === 'project'
            ? PROJECT_HELP_PROMPT
            : PROJECTS_HELP_PROMPT;
    const projectId =
      autoStarter === 'inbound'
        ? selectedProjectId ?? inboundProjectId
        : autoStarter === 'project'
          ? selectedProjectId
          : undefined;
    const hintToAdd =
      autoStarter === 'inbound'
        ? 'inboundHelp'
        : autoStarter === 'projects'
          ? 'projectsHelp'
          : autoStarter === 'schedules'
            ? 'schedulesHelp'
            : autoStarter === 'project'
              ? 'projectHelp'
              : null;
    if (hintToAdd && !dismissedHelpHints.includes(hintToAdd)) {
      setDismissedHelpHints([...dismissedHelpHints, hintToAdd]);
    }
    newConversation({
      template: {
        endpoint: EModelEndpoint.agents,
        agent_id: 'system-general',
        ...(projectId && { userProjectId: projectId }),
      },
    });
    setTimeout(() => submitMessageRef.current?.({ text: prompt }), 150);
  }, [
    hasEllis,
    searchParams,
    setSearchParams,
    selectedProjectId,
    inboundProjectId,
    dismissedHelpHints,
    setDismissedHelpHints,
    newConversation,
  ]);

  return (
    <div className="scrollbar-hover mb-3 overflow-x-auto overflow-y-hidden px-2">
      <div className="grid w-max grid-cols-3 gap-2 py-2">
        {hasEllis &&
          starters.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handlePromptClick(item)}
              className="shrink-0 rounded-2xl border border-border-medium px-4 py-2.5 text-left text-sm text-text-secondary shadow-sm transition-colors hover:bg-surface-tertiary hover:text-text-primary"
            >
              {item.label}
            </button>
          ))}
      </div>
    </div>
  );
}
