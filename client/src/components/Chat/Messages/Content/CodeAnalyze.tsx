import { useState } from 'react';
import { useRecoilValue } from 'recoil';
import { TerminalSquareIcon } from 'lucide-react';
import { useProgress, useLocalize } from '~/hooks';
import ToolResultContainer from './ToolResultContainer';
import MarkdownLite from './MarkdownLite';
import store from '~/store';

export default function CodeAnalyze({
  initialProgress = 0.1,
  code,
  outputs = [],
}: {
  initialProgress: number;
  code: string;
  outputs: Record<string, unknown>[];
}) {
  const localize = useLocalize();
  const progress = useProgress(initialProgress);
  const showAnalysisCode = useRecoilValue(store.showCode);
  const [showCode, setShowCode] = useState(showAnalysisCode);

  const logs = outputs.reduce((acc, output) => {
    if (output['logs']) {
      return acc + output['logs'] + '\n';
    }
    return acc;
  }, '');

  const isComplete = progress >= 1;
  const summaryText = isComplete
    ? localize('com_ui_analyzing_finished')
    : localize('com_ui_analyzing');
  const hasExpandableContent = code.length > 0 || logs.length > 0;

  return (
    <ToolResultContainer
      icon={
        <TerminalSquareIcon className="size-5 shrink-0 text-text-secondary" aria-hidden="true" />
      }
      summary={summaryText}
      isExpanded={showCode}
      onToggle={() => setShowCode((prev) => !prev)}
      isLoading={!isComplete}
      hasExpandableContent={hasExpandableContent}
      minExpandHeight={120}
    >
      <div className="code-analyze-block overflow-hidden rounded-lg border border-border-light bg-surface-tertiary">
        <MarkdownLite
          content={code ? `\`\`\`python\n${code}\n\`\`\`` : ''}
          showCodeToggle
        />
        {logs && (
          <div className="border-t border-border-light bg-surface-secondary p-4 text-xs">
            <div className="mb-1 text-text-secondary">{localize('com_ui_result')}</div>
            <div className="prose flex flex-col-reverse text-text-primary">
              <pre className="shrink-0">{logs}</pre>
            </div>
          </div>
        )}
      </div>
    </ToolResultContainer>
  );
}
