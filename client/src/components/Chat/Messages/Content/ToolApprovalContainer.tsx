import { useRef, useLayoutEffect, useState, useEffect } from 'react';
import ToolApprovalBar from './ToolApprovalBar';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type ToolApprovalContainerProps = {
  onApprove: () => void;
  onDeny: (reason?: string) => void;
  onToggleExpand: () => void;
  isExpanded: boolean;
  isSubmitting: boolean;
  toolName?: string;
  resolved?: 'approved' | 'denied';
  waitingForApprover?: boolean;
  approverName?: string | null;
  showExpandButton?: boolean;
  error?: boolean;
  /** When tool was denied, the user's reason. Shown in expandable content. */
  denialReason?: string | null;
  children?: React.ReactNode;
};

export default function ToolApprovalContainer({
  onApprove,
  onDeny,
  onToggleExpand,
  isExpanded,
  isSubmitting,
  toolName,
  resolved,
  waitingForApprover,
  approverName,
  showExpandButton = true,
  error = false,
  denialReason,
  children,
}: ToolApprovalContainerProps) {
  const localize = useLocalize();
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number>(0);

  const hasExpandableContent =
    (children != null && showExpandButton) || (resolved === 'denied' && !!denialReason);

  useLayoutEffect(() => {
    if (isExpanded && contentRef.current) {
      const fullHeight = contentRef.current.scrollHeight;
      setContentHeight(Math.min(fullHeight + 4, 600));
    } else {
      setContentHeight(0);
    }
  }, [isExpanded]);

  useEffect(() => {
    if (!contentRef.current || !isExpanded) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === contentRef.current) {
          const fullHeight = entry.target.scrollHeight;
          setContentHeight(Math.min(fullHeight + 4, 600));
        }
      }
    });
    resizeObserver.observe(contentRef.current);
    return () => resizeObserver.disconnect();
  }, [isExpanded]);

  return (
    <div
      className={cn(
        'my-2 w-full overflow-hidden rounded-lg border border-border-light bg-surface-secondary shadow-sm',
        error && 'bg-red-500/5 dark:bg-red-950/10',
      )}
    >
      <div className="flex w-full items-center px-3 py-2.5">
        <ToolApprovalBar
          onApprove={onApprove}
          onDeny={onDeny}
          onToggleExpand={onToggleExpand}
          isExpanded={isExpanded}
          isSubmitting={isSubmitting}
          toolName={toolName}
          resolved={resolved}
          waitingForApprover={waitingForApprover}
          approverName={approverName}
          showExpandButton={showExpandButton}
        />
      </div>
      {hasExpandableContent && (
        <div
          className="overflow-hidden transition-all duration-300 ease-out"
          style={{
            height: isExpanded ? contentHeight : 0,
          }}
        >
          <div
            ref={contentRef}
            className="max-h-[600px] overflow-y-auto border-t border-border-light px-3 py-2"
          >
            {resolved === 'denied' && denialReason && (
              <p className="mb-2 text-sm text-text-secondary">
                {localize('com_ui_tool_denial_reason_display') || "User's reason:"} {denialReason}
              </p>
            )}
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
