import { useEffect, useRef, useState } from 'react';
import { SSE } from 'sse.js';
import { agentStream } from 'librechat-data-provider';
import { useAuthContext } from '~/hooks/AuthContext';

export type ScheduledRunProgress = {
  /** Current step/tool name being executed */
  currentStep?: string;
  /** Accumulated text from message deltas */
  textPreview?: string;
  /** Tool calls seen so far */
  toolCalls: string[];
  /** Whether the stream has received a final event */
  isComplete: boolean;
  /** Error message if stream failed */
  error?: string;
};

/**
 * Subscribes to a scheduled run's SSE stream for real-time progress.
 * Only connects when runId and streamId are provided and run status is 'running'.
 */
export function useScheduledRunStream(
  runId: string | null,
  streamId: string | null,
  status: string,
) {
  const { token } = useAuthContext();
  const [progress, setProgress] = useState<ScheduledRunProgress>({
    toolCalls: [],
    isComplete: false,
  });
  const sseRef = useRef<SSE | null>(null);
  const toolCallsSeen = useRef(new Set<string>());

  useEffect(() => {
    if (!runId || !streamId || status !== 'running' || !token) {
      return;
    }

    const url = agentStream(streamId);
    const sse = new SSE(url, {
      headers: { Authorization: `Bearer ${token}` },
      method: 'GET',
    });
    sseRef.current = sse;

    sse.addEventListener('open', () => {
      setProgress((prev) => ({ ...prev, error: undefined }));
    });

    sse.addEventListener('message', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);

        if (data.final != null) {
          setProgress((prev) => ({ ...prev, isComplete: true }));
          sse.close();
          sseRef.current = null;
          return;
        }

        if (data.event === 'on_run_step' && data.data) {
          const step = data.data as {
            stepDetails?: { type?: string; tool_calls?: Array<{ name?: string }> };
          };
          const toolCalls = step.stepDetails?.tool_calls;
          if (Array.isArray(toolCalls)) {
            for (const tc of toolCalls) {
              if (tc.name && !toolCallsSeen.current.has(tc.name)) {
                toolCallsSeen.current.add(tc.name);
                setProgress((prev) => ({
                  ...prev,
                  currentStep: tc.name,
                  toolCalls: [...prev.toolCalls, tc.name],
                }));
              }
            }
          }
          return;
        }

        if (data.event === 'on_message_delta' && data.data?.delta?.content) {
          const content = data.data.delta.content;
          if (Array.isArray(content)) {
            const textParts = content
              .filter((c: { type?: string; text?: string }) => c.type === 'text' && c.text)
              .map((c: { text: string }) => c.text)
              .join('');
            if (textParts) {
              setProgress((prev) => ({
                ...prev,
                textPreview: (prev.textPreview ?? '') + textParts,
              }));
            }
          }
          return;
        }

        if (data.event === 'error') {
          setProgress((prev) => ({
            ...prev,
            isComplete: true,
            error: typeof data.error === 'string' ? data.error : 'Stream error',
          }));
          sse.close();
          sseRef.current = null;
        }
      } catch {
        // Ignore parse errors
      }
    });

    sse.addEventListener('error', () => {
      setProgress((prev) => ({
        ...prev,
        isComplete: true,
        error: prev.error ?? 'Connection error',
      }));
    });

    sse.stream();

    return () => {
      sse.close();
      sseRef.current = null;
    };
  }, [runId, streamId, status, token]);

  return progress;
}
