import { useEffect, useRef, useState } from 'react';
import { SSE } from 'sse.js';
import { agentStream } from 'librechat-data-provider';
import { useAuthContext } from '~/hooks/AuthContext';

export type StepItem =
  | { type: 'thinking' }
  | { type: 'talking' }
  | { type: 'tool_call'; name: string };

export type SubAgentAttachment = {
  file_id?: string;
  filename?: string;
  filepath?: string;
  type?: string;
  width?: number;
  height?: number;
  tool_call_id?: string;
  progress?: number;
  user?: string;
};

export type ScheduledRunProgress = {
  /** Current step/tool name being executed */
  currentStep?: string;
  /** Accumulated text from message deltas */
  textPreview?: string;
  /** Tool calls seen so far */
  toolCalls: string[];
  /** Ordered list of agent steps (thinking, talking, tool_call) for display */
  steps: StepItem[];
  /** Whether the stream has received a final event */
  isComplete: boolean;
  /** Error message if stream failed */
  error?: string;
  /** Files produced by tools (create_pdf, run_tool_and_save, etc.) */
  attachments?: SubAgentAttachment[];
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
    steps: [],
    isComplete: false,
    attachments: [],
  });
  const sseRef = useRef<SSE | null>(null);
  const toolCallsSeen = useRef(new Set<string>());
  const lastContentType = useRef<string | null>(null);

  useEffect(() => {
    if (!runId || !streamId || status !== 'running' || !token) {
      return;
    }

    toolCallsSeen.current = new Set<string>();
    lastContentType.current = null;
    setProgress((prev) => ({ ...prev, toolCalls: [], steps: [], attachments: [] }));

    const url = agentStream(streamId, false);
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

        if (data.event === 'attachment' && data.data) {
          setProgress((prev) => ({
            ...prev,
            attachments: [...(prev.attachments ?? []), data.data],
          }));
          return;
        }

        if (data.event === 'on_run_step' && data.data) {
          const step = data.data as {
            stepDetails?: { type?: string; tool_calls?: Array<{ name?: string }> };
          };
          const toolCalls = step.stepDetails?.tool_calls;
          if (Array.isArray(toolCalls)) {
            const newSteps: StepItem[] = [];
            for (const tc of toolCalls) {
              if (tc.name && !toolCallsSeen.current.has(tc.name)) {
                toolCallsSeen.current.add(tc.name);
                newSteps.push({ type: 'tool_call', name: tc.name });
              }
            }
            if (newSteps.length > 0) {
              setProgress((prev) => ({
                ...prev,
                currentStep: newSteps[newSteps.length - 1].name,
                toolCalls: [...prev.toolCalls, ...newSteps.map((s) => s.name)],
                steps: [...prev.steps, ...newSteps],
              }));
            }
          }
          return;
        }

        if (data.event === 'on_message_delta' && data.data?.delta?.content) {
          const rawContent = data.data.delta.content;
          const content = Array.isArray(rawContent) ? rawContent : [rawContent];
          if (content.length > 0) {
            const contentPart = content[0] as { type?: string; text?: string } | undefined;
            const contentType = contentPart?.type ?? '';
            const textParts = content
              .filter((c: { type?: string; text?: string }) => c.type === 'text' && c.text)
              .map((c: { text: string }) => c.text)
              .join('');

            const isThinking =
              contentType === 'think' ||
              contentType === 'thinking' ||
              contentType === 'reasoning' ||
              contentType === 'reasoning_content' ||
              (typeof contentType === 'string' && contentType.startsWith('reasoning'));
            const isTalking =
              contentType === 'text' ||
              contentType === 'text_delta' ||
              (typeof contentType === 'string' && contentType.startsWith('text'));

            let stepToAdd: StepItem | null = null;
            if (isThinking && lastContentType.current !== 'thinking') {
              lastContentType.current = 'thinking';
              stepToAdd = { type: 'thinking' };
            } else if (isTalking && lastContentType.current !== 'talking') {
              lastContentType.current = 'talking';
              stepToAdd = { type: 'talking' };
            }

            setProgress((prev) => ({
              ...prev,
              textPreview: textParts ? (prev.textPreview ?? '') + textParts : prev.textPreview,
              steps: stepToAdd ? [...prev.steps, stepToAdd] : prev.steps,
            }));
          }
          return;
        }

        if (data.event === 'on_reasoning_delta' && data.data?.delta?.content) {
          if (lastContentType.current !== 'thinking') {
            lastContentType.current = 'thinking';
            setProgress((prev) => ({
              ...prev,
              steps: [...prev.steps, { type: 'thinking' }],
            }));
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
