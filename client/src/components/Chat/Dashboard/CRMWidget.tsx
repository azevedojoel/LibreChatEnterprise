import { useCallback } from 'react';
import { useAuthContext, useLocalize, useSubmitMessage } from '~/hooks';
import CollapsibleWidget from './CollapsibleWidget';

const QUICK_PROMPTS = [
  'com_ui_dashboard_crm_prompt_followup',
  'com_ui_dashboard_crm_prompt_leads',
  'com_ui_dashboard_crm_prompt_contacted',
] as const;

const BULLET_PROMPTS = [
  { key: 'com_ui_dashboard_crm_view_contacts', text: 'Show my recent contacts' },
  { key: 'com_ui_dashboard_crm_view_deals', text: 'Show my open deals' },
] as const;

export default function CRMWidget() {
  const { user } = useAuthContext();
  const localize = useLocalize();
  const { submitMessage } = useSubmitMessage();

  const projectId = user?.projectId;
  if (!projectId) {
    return null;
  }

  const handlePrompt = useCallback(
    (text: string) => {
      submitMessage({ text });
    },
    [submitMessage],
  );

  return (
    <CollapsibleWidget title={localize('com_ui_dashboard_crm_title')} storageKey="crm">
      <ul className="mb-3 space-y-1 text-sm text-text-secondary">
        {BULLET_PROMPTS.map(({ key, text }) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => handlePrompt(text)}
              className="cursor-pointer text-left hover:text-text-primary hover:underline"
            >
              • {localize(key)}
            </button>
          </li>
        ))}
      </ul>
      <div className="space-y-2">
        <p className="text-xs font-medium text-text-secondary">
          {localize('com_ui_dashboard_crm_quick_prompts')}
        </p>
        <div className="flex flex-col gap-2">
          {QUICK_PROMPTS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => handlePrompt(localize(key))}
              className="cursor-pointer rounded-lg border border-border-medium px-3 py-2 text-left text-sm text-text-secondary shadow-[0_0_2px_0_rgba(0,0,0,0.05),0_4px_6px_0_rgba(0,0,0,0.02)] transition-colors duration-300 hover:bg-surface-tertiary hover:text-text-primary"
            >
              &quot;{localize(key)}&quot;
            </button>
          ))}
        </div>
      </div>
    </CollapsibleWidget>
  );
}
