import { useState, useMemo, type ReactNode } from 'react';
import { Constants, ContentTypes } from 'librechat-data-provider';
import type { TMessageContentParts, TAttachment, Agents } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import ProgressText from './ProgressText';
import type { PartWithIndex } from './ParallelContent';

type ToolCallGroupProps = {
  parts: PartWithIndex[];
  messageId: string;
  renderPart: (part: TMessageContentParts, idx: number, isLastPart: boolean) => ReactNode;
  isLast: boolean;
};

function isToolSearch(name: string | undefined): boolean {
  return (
    name === Constants.TOOL_SEARCH ||
    (typeof name === 'string' && name.startsWith('tool_search_mcp_'))
  );
}

function getToolCallProgress(part: TMessageContentParts): number {
  const toolCall = part?.[ContentTypes.TOOL_CALL] as Agents.ToolCall | undefined;
  if (!toolCall) {
    return 1;
  }
  const hasOutput = toolCall.output != null && toolCall.output !== '';
  const hasArgs =
    (typeof toolCall.args === 'string' && toolCall.args.trim() !== '') ||
    (typeof toolCall.args === 'object' && toolCall.args != null && Object.keys(toolCall.args).length > 0);
  if (
    isToolSearch(toolCall.name) &&
    !hasOutput &&
    (toolCall.progress == null || toolCall.progress < 1) &&
    hasArgs
  ) {
    return 1;
  }
  const p = toolCall.progress ?? (hasOutput ? 1 : 0.1);
  return typeof p === 'number' ? p : 1;
}

export default function ToolCallGroup({
  parts,
  messageId,
  renderPart,
  isLast,
}: ToolCallGroupProps) {
  const localize = useLocalize();
  const [isExpanded, setIsExpanded] = useState(false);

  const progress = useMemo(() => {
    const values = parts.map(({ part }) => getToolCallProgress(part));
    return values.some((p) => p < 1) ? Math.min(...values) : 1;
  }, [parts]);

  const label = localize('com_assistants_tool_group_collapsed', { 0: parts.length });

  if (isExpanded) {
    const lastIdx = parts.length - 1;
    return (
      <>
        <div className="relative my-2.5 flex h-5 shrink-0 items-center gap-2.5">
          <ProgressText
            muted
            progress={progress}
            onClick={() => setIsExpanded(false)}
            inProgressText={label}
            finishedText={label}
            hasInput={true}
            isExpanded={true}
          />
        </div>
        <div className="pl-4">
          {parts.map(({ part, idx }, i) =>
            renderPart(part, idx, i === lastIdx && isLast),
          )}
        </div>
      </>
    );
  }

  return (
    <div className="relative my-2.5 flex h-5 shrink-0 items-center gap-2.5">
      <ProgressText
        muted
        progress={progress}
        onClick={() => setIsExpanded(true)}
        inProgressText={label}
        finishedText={label}
        hasInput={true}
        isExpanded={false}
      />
    </div>
  );
}
