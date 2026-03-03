import { useRef, useLayoutEffect, useState, useEffect } from 'react';
import { Spinner } from '@librechat/client';
import { ChevronDown, ChevronUp } from 'lucide-react';
import CancelledIcon from './CancelledIcon';
import FinishedIcon from './FinishedIcon';
import { cn } from '~/utils';

type ToolResultContainerProps = {
  icon: React.ReactNode;
  summary: string;
  resultsCount?: number;
  isExpanded: boolean;
  onToggle: () => void;
  isLoading?: boolean;
  error?: boolean;
  hasExpandableContent?: boolean;
  /** Minimum height when expanded (e.g. 120) to avoid cramped single-line content */
  minExpandHeight?: number;
  children?: React.ReactNode;
};

export default function ToolResultContainer({
  icon,
  summary,
  resultsCount,
  isExpanded,
  onToggle,
  isLoading = false,
  error = false,
  hasExpandableContent = true,
  minExpandHeight,
  children,
}: ToolResultContainerProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number>(0);

  const MAX_RESULTS_HEIGHT = 600; // Auto-height up to 600px, then scroll
  const MIN_HEIGHT = minExpandHeight ?? 0;

  const computeHeight = (raw: number) => {
    const withMin = Math.max(raw + 4, MIN_HEIGHT);
    return Math.min(withMin, MAX_RESULTS_HEIGHT);
  };

  useLayoutEffect(() => {
    if (isExpanded && contentRef.current) {
      const fullHeight = contentRef.current.scrollHeight;
      setContentHeight(computeHeight(fullHeight));
    } else {
      setContentHeight(0);
    }
  }, [isExpanded, minExpandHeight]);

  useEffect(() => {
    if (!contentRef.current || !isExpanded) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === contentRef.current) {
          const fullHeight = entry.target.scrollHeight;
          setContentHeight(computeHeight(fullHeight));
        }
      }
    });
    resizeObserver.observe(contentRef.current);
    return () => resizeObserver.disconnect();
  }, [isExpanded, minExpandHeight]);

  const getStatusIcon = () => {
    if (error) {
      return <CancelledIcon />;
    }
    if (isLoading) {
      return <Spinner />;
    }
    return <FinishedIcon />;
  };

  const canExpand = hasExpandableContent && (resultsCount != null ? resultsCount > 0 : true);

  return (
    <div
      className={cn(
        'my-2 w-full overflow-hidden rounded-lg border border-border-light bg-surface-secondary shadow-sm',
        error && 'bg-red-500/5 dark:bg-red-950/10',
      )}
    >
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
          canExpand && 'cursor-pointer hover:bg-surface-tertiary/50',
          !canExpand && 'cursor-default',
        )}
        onClick={canExpand ? onToggle : undefined}
        disabled={!canExpand}
        aria-expanded={canExpand ? isExpanded : undefined}
      >
        <span className="flex shrink-0">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{summary}</span>
        {resultsCount != null && (
          <span className="shrink-0 text-sm text-text-secondary">{resultsCount} results</span>
        )}
        <span className="flex shrink-0 items-center gap-1.5">
          {getStatusIcon()}
          {canExpand &&
            (isExpanded ? (
              <ChevronUp className="size-4 text-text-secondary" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-4 text-text-secondary" aria-hidden="true" />
            ))}
        </span>
      </button>
      <div
        className="overflow-hidden transition-all duration-300 ease-out"
        style={{
          height: canExpand ? (isExpanded ? contentHeight : 0) : 0,
        }}
      >
        <div
          ref={contentRef}
          className="max-h-[600px] overflow-y-auto border-t border-border-light px-3 py-2"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
