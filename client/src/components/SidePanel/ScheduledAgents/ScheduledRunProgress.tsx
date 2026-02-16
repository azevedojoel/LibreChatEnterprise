import { Loader2 } from 'lucide-react';
import { useScheduledRunStream } from '~/hooks/ScheduledAgents/useScheduledRunStream';
import { cn } from '~/utils';

type ScheduledRunProgressProps = {
  runId: string;
  streamId: string;
  status: string;
  className?: string;
};

/** Compact live progress for a scheduled run - shows tools and text preview */
export function ScheduledRunProgress({ runId, streamId, status, className }: ScheduledRunProgressProps) {
  const progress = useScheduledRunStream(runId, streamId, status);

  if (status !== 'running' || progress.isComplete) {
    return null;
  }

  return (
    <div
      className={cn(
        'mt-1 space-y-0.5 rounded border border-border-medium bg-surface-secondary/50 px-2 py-1 text-xs',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-1.5 text-text-secondary">
        <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden="true" />
        {progress.currentStep ? (
          <span>{progress.currentStep}</span>
        ) : (
          <span>Running...</span>
        )}
      </div>
      {progress.toolCalls.length > 0 && (
        <div className="truncate pl-4 text-text-tertiary">
          Tools: {progress.toolCalls.join(', ')}
        </div>
      )}
      {progress.textPreview && (
        <div className="max-h-12 truncate pl-4 text-text-tertiary" title={progress.textPreview}>
          {progress.textPreview}
        </div>
      )}
      {progress.error && (
        <div className="pl-4 text-red-600 dark:text-red-400">{progress.error}</div>
      )}
    </div>
  );
}
