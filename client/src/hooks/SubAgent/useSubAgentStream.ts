import { useScheduledRunStream } from '~/hooks/ScheduledAgents/useScheduledRunStream';

/**
 * Subscribes to a sub-agent run's SSE stream for real-time progress.
 * Wraps useScheduledRunStream with streamId only (no runId/status needed).
 */
export function useSubAgentStream(streamId: string | null) {
  return useScheduledRunStream(streamId, streamId, 'running');
}
