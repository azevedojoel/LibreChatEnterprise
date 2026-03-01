import { useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useToastContext } from '@librechat/client';
import { useMessageContext } from '~/Providers';
import { useSubmitToolConfirmationMutation } from '~/data-provider/SSE/mutations';
import useLocalize from './useLocalize';
import store from '~/store';

const DENIAL_PATTERNS = /user denied|denied execution/i;

/**
 * Derive denial status from tool output. Does NOT infer "approved" from output alone,
 * since tools that never required approval also have output.
 * - Output with denial text → denied
 * - No output or no denial → null
 */
function getDenialFromOutput(output?: string): 'denied' | null {
  if (!output || output.length === 0) return null;
  return DENIAL_PATTERNS.test(output) ? 'denied' : null;
}

/**
 * Hook for tool approval flow. Use in any component that renders a destructive tool.
 * Returns pending match state, approval status, and approve/deny handlers.
 */
function getResolvedKey(
  conversationId?: string | null,
  messageId?: string | null,
  toolCallId?: string | null,
): string | null {
  if (!conversationId || !messageId || !toolCallId) return null;
  return `${conversationId}:${messageId}:${toolCallId}`;
}

export function useToolApproval(toolCallId?: string, output?: string) {
  const { conversationId, messageId } = useMessageContext();
  const pendingToolConfirmations = useRecoilValue(store.pendingToolConfirmationAtom);
  const setPendingToolConfirmation = useSetRecoilState(store.pendingToolConfirmationAtom);
  const resolvedToolApprovals = useRecoilValue(store.resolvedToolApprovalsAtom);
  const setResolvedToolApprovals = useSetRecoilState(store.resolvedToolApprovalsAtom);
  const submitMutation = useSubmitToolConfirmationMutation();
  const { showToast } = useToastContext();
  const localize = useLocalize();

  const pending = toolCallId ? pendingToolConfirmations[toolCallId] : undefined;
  const pendingMatches =
    !!pending &&
    !!toolCallId &&
    !!conversationId &&
    !!messageId &&
    pending.conversationId === conversationId &&
    pending.runId === messageId;

  const resolvedKey = getResolvedKey(conversationId, messageId, toolCallId);
  const resolvedStatus = resolvedKey ? resolvedToolApprovals[resolvedKey] : undefined;
  const outputDenial = getDenialFromOutput(output);

  const approvalStatus: 'pending' | 'approved' | 'denied' | null =
    outputDenial === 'denied'
      ? 'denied'
      : pendingMatches
        ? 'pending'
        : resolvedStatus === 'approved' && output && output.length > 0
          ? 'approved'
          : resolvedStatus === 'denied'
            ? 'denied'
            : null;

  const [approvalSubmitting, setApprovalSubmitting] = useState(false);

  const handleApprove = useCallback(async () => {
    if (!conversationId || !toolCallId) return;
    if (!pending?.runId && !messageId) return;
    setApprovalSubmitting(true);
    try {
      const result = await submitMutation.mutateAsync({
        conversationId,
        runId: pending?.runId,
        messageId,
        toolCallId,
        approved: true,
      });
      if (result.success) {
        const key = getResolvedKey(conversationId, messageId, toolCallId);
        if (key) {
          setResolvedToolApprovals((prev) => ({ ...prev, [key]: 'approved' }));
        }
        setPendingToolConfirmation((prev) => {
          const next = { ...prev };
          delete next[toolCallId];
          return next;
        });
      } else {
        showToast({
          message: localize('com_ui_tool_approval_submit_error') || 'Failed to submit approval. Please try again.',
          status: 'error',
        });
      }
    } catch {
      showToast({
        message: localize('com_ui_tool_approval_submit_error') || 'Failed to submit approval. Please try again.',
        status: 'error',
      });
    } finally {
      setApprovalSubmitting(false);
    }
  }, [conversationId, messageId, toolCallId, pending?.runId, submitMutation, setPendingToolConfirmation, setResolvedToolApprovals, showToast, localize]);

  const handleDeny = useCallback(async () => {
    if (!conversationId || !toolCallId) return;
    if (!pending?.runId && !messageId) return;
    setApprovalSubmitting(true);
    try {
      const result = await submitMutation.mutateAsync({
        conversationId,
        runId: pending?.runId,
        messageId,
        toolCallId,
        approved: false,
      });
      if (result.success) {
        const key = getResolvedKey(conversationId, messageId, toolCallId);
        if (key) {
          setResolvedToolApprovals((prev) => ({ ...prev, [key]: 'denied' }));
        }
        setPendingToolConfirmation((prev) => {
          const next = { ...prev };
          delete next[toolCallId];
          return next;
        });
      } else {
        showToast({
          message: localize('com_ui_tool_approval_submit_error') || 'Failed to submit approval. Please try again.',
          status: 'error',
        });
      }
    } catch {
      showToast({
        message: localize('com_ui_tool_approval_submit_error') || 'Failed to submit approval. Please try again.',
        status: 'error',
      });
    } finally {
      setApprovalSubmitting(false);
    }
  }, [conversationId, messageId, toolCallId, pending?.runId, submitMutation, setPendingToolConfirmation, setResolvedToolApprovals, showToast, localize]);

  return {
    pendingMatches,
    approvalStatus,
    handleApprove,
    handleDeny,
    approvalSubmitting,
  };
}
