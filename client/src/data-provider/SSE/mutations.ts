import { useMutation } from '@tanstack/react-query';
import { apiBaseUrl, request } from 'librechat-data-provider';

export interface AbortStreamParams {
  /** The stream ID to abort (if known) */
  streamId?: string;
  /** The conversation ID to abort (backend will look up the job) */
  conversationId?: string;
}

export interface AbortStreamResponse {
  success: boolean;
  aborted?: string;
  error?: string;
}

/**
 * Abort an ongoing generation stream.
 * The backend will emit a `done` event with `aborted: true` to the SSE stream,
 * allowing the client to handle cleanup via the normal event flow.
 *
 * Can pass either streamId or conversationId - backend will find the job.
 */
export const abortStream = async (params: AbortStreamParams): Promise<AbortStreamResponse> => {
  const result = (await request.post(
    `${apiBaseUrl()}/api/agents/chat/abort`,
    params,
  )) as AbortStreamResponse;
  return result;
};

/**
 * React Query mutation hook for aborting a generation stream.
 * Use this when the user explicitly clicks the stop button.
 */
export function useAbortStreamMutation() {
  return useMutation({
    mutationFn: abortStream,
  });
}

export interface SubmitToolConfirmationParams {
  /** Token flow (approval page): id from URL */
  id?: string;
  /** Inline flow (web UI): conversationId, messageId or runId, toolCallId */
  conversationId?: string;
  /** Fallback when runId not available (e.g. from tool_confirmation_required) */
  messageId?: string;
  /** Prefer runId from tool_confirmation_required to avoid backend mismatch */
  runId?: string;
  toolCallId?: string;
  approved: boolean;
}

export interface PendingToolConfirmationResponse {
  toolName: string;
  argsSummary: string;
  conversationId: string;
  contextLabel?: string;
  conversationTitle?: string;
  recentMessages?: Array<{ role: 'user' | 'assistant'; text: string }>;
}

/**
 * Submit user approval/denial for a destructive tool.
 */
export const submitToolConfirmation = async (
  params: SubmitToolConfirmationParams,
): Promise<{ success: boolean; error?: string }> => {
  const result = (await request.post(
    `${apiBaseUrl()}/api/agents/chat/tool-confirmation`,
    params,
  )) as { success: boolean; error?: string };
  return result;
};

/**
 * Fetch pending tool confirmation details (for approval page).
 */
export const getPendingToolConfirmation = async (params: {
  id: string;
}): Promise<PendingToolConfirmationResponse> => {
  const query = new URLSearchParams(params).toString();
  return request.get(
    `${apiBaseUrl()}/api/agents/chat/tool-confirmation/pending?${query}`,
  ) as Promise<PendingToolConfirmationResponse>;
};

/**
 * React Query mutation hook for submitting tool confirmation.
 */
export function useSubmitToolConfirmationMutation() {
  return useMutation({
    mutationFn: submitToolConfirmation,
  });
}
