import { useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useToastContext } from '@librechat/client';
import { useMessageContext } from '~/Providers';
import { useSubmitToolConfirmationMutation } from '~/data-provider/SSE/mutations';
import useLocalize from './useLocalize';
import store from '~/store';

/**
 * Hook for tool approval flow. Use in any component that renders a destructive tool.
 * Returns pending match state and approve/deny handlers.
 */
export function useToolApproval(toolCallId?: string) {
  const { conversationId, messageId } = useMessageContext();
  const pendingToolConfirmations = useRecoilValue(store.pendingToolConfirmationAtom);
  const setPendingToolConfirmation = useSetRecoilState(store.pendingToolConfirmationAtom);
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

  const [approvalSubmitting, setApprovalSubmitting] = useState(false);

  const handleApprove = useCallback(async () => {
    if (!conversationId || !messageId || !toolCallId) return;
    setApprovalSubmitting(true);
    try {
      const result = await submitMutation.mutateAsync({
        conversationId,
        messageId,
        toolCallId,
        approved: true,
      });
      if (result.success) {
        setPendingToolConfirmation((prev) => {
          const next = { ...prev };
          delete next[toolCallId];
          return next;
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
  }, [conversationId, messageId, toolCallId, submitMutation, setPendingToolConfirmation, showToast, localize]);

  const handleDeny = useCallback(async () => {
    if (!conversationId || !messageId || !toolCallId) return;
    setApprovalSubmitting(true);
    try {
      const result = await submitMutation.mutateAsync({
        conversationId,
        messageId,
        toolCallId,
        approved: false,
      });
      if (result.success) {
        setPendingToolConfirmation((prev) => {
          const next = { ...prev };
          delete next[toolCallId];
          return next;
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
  }, [conversationId, messageId, toolCallId, submitMutation, setPendingToolConfirmation, showToast, localize]);

  return {
    pendingMatches,
    handleApprove,
    handleDeny,
    approvalSubmitting,
  };
}
