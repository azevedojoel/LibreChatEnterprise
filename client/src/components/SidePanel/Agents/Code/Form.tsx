import { Tools } from 'librechat-data-provider';
import { useFormContext } from 'react-hook-form';
import type { ExtendedFile } from '~/common';
import { useLocalize } from '~/hooks';
import { defaultTextProps, removeFocusOutlines } from '~/utils';
import { cn } from '~/utils';
import Action from './Action';
import Files from './Files';

const inputClass = cn(
  defaultTextProps,
  'flex w-full px-3 py-2 border-border-light bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring-primary',
  removeFocusOutlines,
);

export default function CodeForm({
  agent_id,
  files,
}: {
  agent_id: string;
  files?: [string, ExtendedFile][];
}) {
  const localize = useLocalize();
  const { control, watch } = useFormContext();
  const executeCodeEnabled = watch(Tools.execute_code);

  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center gap-2">
        <div className="flex flex-row items-center gap-1">
          <div className="flex items-center gap-1">
            <span className="text-token-text-primary block font-medium">
              {localize('com_agents_code_interpreter_title')}
            </span>
            <span className="text-xs text-text-secondary">
              {localize('com_agents_by_librechat')}
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Action />
        <Files agent_id={agent_id} files={files} />
      </div>
    </div>
  );
}
