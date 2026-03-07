import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { useSubAgentStream } from '~/hooks/SubAgent/useSubAgentStream';
import { cn, getToolDisplayName } from '~/utils';

type RunSubAgentProgressProps = {
  streamId: string | null;
  agentName?: string;
  className?: string;
};

/** Compact progress for a run_sub_agent tool - shows running state or completed state */
export function RunSubAgentProgress({ streamId, agentName, className }: RunSubAgentProgressProps) {
  const progress = useSubAgentStream(streamId);

  if (!streamId) {
    return null;
  }

  const currentStepDisplay = progress.currentStep
    ? getToolDisplayName(progress.currentStep)
    : null;
  const toolCallsDisplay = progress.toolCalls.map(getToolDisplayName);
  const isComplete = progress.isComplete;

  return (
    <div
      className={cn(
        'mt-1 space-y-1 rounded-lg border border-border-light px-2.5 py-1.5 text-xs',
        isComplete ? 'bg-surface-secondary/60' : 'bg-surface-tertiary',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-text-secondary">
        {isComplete ? (
          progress.error ? (
            <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" aria-hidden="true" />
          ) : (
            <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-500" aria-hidden="true" />
          )
        ) : (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
        )}
        {isComplete ? (
          <span className="font-medium text-text-primary">
            {progress.error ? 'Failed' : 'Completed'}
            {currentStepDisplay && ` · ${currentStepDisplay}`}
          </span>
        ) : currentStepDisplay ? (
          <span className="font-medium text-text-primary">{currentStepDisplay}</span>
        ) : (
          <span className="font-medium text-text-primary">
            {agentName ? `Working with ${agentName}` : 'Working...'}
          </span>
        )}
      </div>
      {toolCallsDisplay.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-5">
          {toolCallsDisplay.map((name, i) => (
            <span
              key={i}
              className="rounded-md bg-surface-primary/60 px-1.5 py-0.5 text-text-tertiary"
            >
              {name}
            </span>
          ))}
        </div>
      )}
      {progress.textPreview && (
        <div
          className={cn(
            'overflow-hidden truncate pl-5 text-text-tertiary',
            isComplete ? 'max-h-8' : 'max-h-14',
          )}
          title={progress.textPreview}
        >
          {progress.textPreview}
        </div>
      )}
      {progress.error && (
        <div className="pl-5 text-sm text-red-600 dark:text-red-400">{progress.error}</div>
      )}
    </div>
  );
}
