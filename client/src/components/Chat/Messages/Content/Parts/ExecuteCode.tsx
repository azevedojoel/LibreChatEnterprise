import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { TerminalSquareIcon, FileDown } from 'lucide-react';
import { Tools, type TAttachment } from 'librechat-data-provider';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import ToolResultContainer from '~/components/Chat/Messages/Content/ToolResultContainer';
import ToolApprovalContainer from '~/components/Chat/Messages/Content/ToolApprovalContainer';
import { useProgress, useLocalize, useToolApproval } from '~/hooks';
import { AttachmentGroup } from './Attachment';
import Stdout from './Stdout';
import store from '~/store';

interface ParsedArgs {
  lang?: string;
  code?: string;
}

export function useParseArgs(args?: string): ParsedArgs | null {
  return useMemo(() => {
    let parsedArgs: ParsedArgs | string | undefined | null = args;
    try {
      parsedArgs = JSON.parse(args || '');
    } catch {
      // console.error('Failed to parse args:', e);
    }
    if (typeof parsedArgs === 'object') {
      return parsedArgs;
    }
    const langMatch = args?.match(/"lang"\s*:\s*"(\w+)"/);
    const codeMatch = args?.match(/"code"\s*:\s*"(.+?)(?="\s*,\s*"(session_id|args)"|"\s*})/s);

    let code = '';
    if (codeMatch) {
      code = codeMatch[1];
      if (code.endsWith('"}')) {
        code = code.slice(0, -2);
      }
      code = code.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }

    return {
      lang: langMatch ? langMatch[1] : '',
      code,
    };
  }, [args]);
}

export default function ExecuteCode({
  isSubmitting,
  initialProgress = 0.1,
  args,
  output = '',
  attachments,
  toolCallId,
  toolName,
}: {
  initialProgress: number;
  isSubmitting: boolean;
  args?: string;
  output?: string;
  attachments?: TAttachment[];
  toolCallId?: string;
  toolName?: string;
}) {
  const localize = useLocalize();
  const { pendingMatches, approvalStatus, handleApprove, handleDeny, approvalSubmitting, waitingForApprover, approverName, denialReason } =
    useToolApproval(toolCallId, output);

  const hasOutput = output.length > 0;
  const outputRef = useRef<string>(output);
  const outputContainerRef = useRef<HTMLDivElement>(null);
  const showAnalysisCode = useRecoilValue(store.showCode);
  const [showCode, setShowCode] = useState(showAnalysisCode);
  const { lang = 'py', code } = useParseArgs(args) ?? ({} as ParsedArgs);
  const progress = useProgress(initialProgress);

  useEffect(() => {
    if (output !== outputRef.current) {
      outputRef.current = output;
    }

    if (outputContainerRef.current && isSubmitting) {
      outputContainerRef.current.scrollTop = outputContainerRef.current.scrollHeight;
    }
  }, [output, isSubmitting]);

  const cancelled = !isSubmitting && progress < 1;
  const showApprovalBar = approvalStatus !== null;
  const isComplete = progress >= 1;
  const isExportToFile = toolName === Tools.run_tool_and_save;
  let summaryText: string;
  if (cancelled) {
    summaryText = localize('com_ui_cancelled');
  } else if (isComplete) {
    summaryText = isExportToFile
      ? localize('com_ui_export_to_file_complete')
      : localize('com_ui_analyzing_finished');
  } else {
    summaryText = isExportToFile
      ? localize('com_ui_exporting_to_file')
      : localize('com_ui_analyzing');
  }
  const hasExpandableContent = (code?.length ?? 0) > 0 || hasOutput;

  const codeContent = (
    <div className="code-analyze-block overflow-hidden rounded-lg border border-border-light bg-surface-tertiary">
      <MarkdownLite
        content={code ? `\`\`\`${lang}\n${code}\n\`\`\`` : ''}
        codeExecution={false}
        showCodeToggle
      />
      {hasOutput && (
        <div
          ref={outputContainerRef}
          className="max-h-96 overflow-y-auto border-t border-border-light bg-surface-secondary p-4 text-xs"
        >
          <div className="prose">
            <Stdout output={output} />
          </div>
        </div>
      )}
    </div>
  );

  if (showApprovalBar) {
    return (
      <>
        <ToolApprovalContainer
          onApprove={handleApprove}
          onDeny={handleDeny}
          onToggleExpand={() => setShowCode((prev) => !prev)}
          isExpanded={showCode}
          isSubmitting={approvalSubmitting}
          toolName="execute_code"
          resolved={
            approvalStatus === 'approved' ? 'approved' : approvalStatus === 'denied' ? 'denied' : undefined
          }
          waitingForApprover={waitingForApprover}
          approverName={approverName}
          denialReason={denialReason}
        >
          {codeContent}
        </ToolApprovalContainer>
        {attachments && attachments.length > 0 && <AttachmentGroup attachments={attachments} />}
      </>
    );
  }

  const ResultIcon = isExportToFile ? FileDown : TerminalSquareIcon;
  return (
    <>
      <ToolResultContainer
        icon={
          <ResultIcon className="size-5 shrink-0 text-text-secondary" aria-hidden="true" />
        }
        summary={summaryText}
        isExpanded={showCode}
        onToggle={() => setShowCode((prev) => !prev)}
        isLoading={!isComplete && !cancelled}
        error={cancelled}
        hasExpandableContent={hasExpandableContent}
        minExpandHeight={120}
      >
        {codeContent}
      </ToolResultContainer>
      {attachments && attachments.length > 0 && <AttachmentGroup attachments={attachments} />}
    </>
  );
}
