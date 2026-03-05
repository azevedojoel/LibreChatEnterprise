import { useCallback, useRef } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import { useAgentsMapContext, useChatContext } from '~/Providers';
import { useSubmitMessage } from '~/hooks';

const AGENT_STARTERS = [
  {
    label: 'Meet the agents',
    text: 'Hey ellis, please ask each agent of the daily thread family of agents what their name and function is then introduce yourself at the end',
  },
  {
    label: 'Draft follow-up email',
    text: 'Help me draft a professional client follow-up email. Include a friendly tone, recap of our last conversation, and a clear call to action.',
  },
  {
    label: 'Add contact',
    text: "Add a new contact to my address book. I'll provide the name and details.",
  },
  {
    label: "Today's emails",
    text: 'Check my emails from today and give me a summary of what needs my attention.',
  },
  {
    label: 'Morning briefing',
    text: 'Set up a daily morning briefing to be sent to me every day at 8am.',
  },
  {
    label: 'What can you do?',
    text: 'What can you help me with? Please give me an overview of your capabilities and the agents available.',
  },
] as const;

export default function AgentStarterPrompts() {
  const agentsMap = useAgentsMapContext();
  const { newConversation } = useChatContext();
  const { submitMessage } = useSubmitMessage();
  const submitMessageRef = useRef(submitMessage);
  submitMessageRef.current = submitMessage;

  const hasEllis = !!agentsMap?.['system-general'];

  const handlePromptClick = useCallback(
    (prompt: string) => {
      if (!hasEllis) return;
      newConversation({
        template: { endpoint: EModelEndpoint.agents, agent_id: 'system-general' },
      });
      setTimeout(() => submitMessageRef.current?.({ text: prompt }), 150);
    },
    [newConversation, hasEllis],
  );

  return (
    <div className="scrollbar-hover mb-3 overflow-x-auto overflow-y-hidden px-2">
      <div className="grid w-max grid-cols-3 gap-2 py-2">
        {hasEllis &&
          AGENT_STARTERS.map((prompt) => (
            <button
              key={prompt.label}
              type="button"
              onClick={() => handlePromptClick(prompt.text)}
              className="shrink-0 rounded-2xl border border-border-medium px-4 py-2.5 text-left text-sm text-text-secondary shadow-sm transition-colors hover:bg-surface-tertiary hover:text-text-primary"
            >
              {prompt.label}
            </button>
          ))}
      </div>
    </div>
  );
}
