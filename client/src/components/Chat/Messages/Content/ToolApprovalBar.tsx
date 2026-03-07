import { useState } from 'react';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogHeader,
  Textarea,
} from '@librechat/client';
import { CheckCircle, ShieldAlert, XCircle } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { getToolDisplayName } from '~/utils';

type ToolApprovalBarProps = {
  onApprove: () => void;
  /** Called with optional reason when user confirms denial */
  onDeny: (reason?: string) => void;
  onToggleExpand: () => void;
  isExpanded: boolean;
  isSubmitting: boolean;
  /** Tool name for human-readable label (e.g. execute_code, tasks_createTask) */
  toolName?: string;
  /** When set, shows Approved/Denied status instead of Approve/Deny buttons */
  resolved?: 'approved' | 'denied';
  /** When true, approval is routed to another user; hide Approve/Deny, show waiting message */
  waitingForApprover?: boolean;
  approverName?: string | null;
  /** When false, hide the expand/collapse button. Default true. */
  showExpandButton?: boolean;
};

export default function ToolApprovalBar({
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
}: ToolApprovalBarProps) {
  const localize = useLocalize();
  const [denyDialogOpen, setDenyDialogOpen] = useState(false);
  const [denyReason, setDenyReason] = useState('');

  const handleDenyClick = () => {
    setDenyReason('');
    setDenyDialogOpen(true);
  };

  const handleConfirmDeny = () => {
    const reason = denyReason?.trim() || undefined;
    setDenyDialogOpen(false);
    setDenyReason('');
    onDeny(reason);
  };

  const handleCancelDeny = () => {
    setDenyDialogOpen(false);
    setDenyReason('');
  };

  const label = toolName
    ? getToolDisplayName(toolName)
    : localize('com_ui_tool_approval_required') || 'Tool approval required';
  const waitingLabel = approverName
    ? localize('com_ui_tool_waiting_for_approver', { approverName }) ||
      `Waiting for ${approverName} to approve.`
    : localize('com_ui_tool_waiting_for_approval_email') ||
      'Waiting for approval. The approver will receive an email.';

  return (
    <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-2 py-0.5">
      <span className="flex items-center gap-1.5 text-sm text-text-secondary">
        {resolved === 'approved' ? (
          <CheckCircle
            className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400"
            aria-hidden="true"
          />
        ) : resolved === 'denied' ? (
          <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
        ) : (
          <ShieldAlert className="h-4 w-4 shrink-0 text-text-warning" aria-hidden="true" />
        )}
        {resolved === 'approved'
          ? localize('com_ui_tool_approved') || 'Approved'
          : resolved === 'denied'
            ? localize('com_ui_tool_denied') || 'Denied'
            : waitingForApprover
              ? waitingLabel
              : label}
      </span>
      {!resolved && !waitingForApprover && (
        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onApprove}
            disabled={isSubmitting}
          >
            {localize('com_ui_approve') || 'Approve'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleDenyClick}
            disabled={isSubmitting}
          >
            {localize('com_ui_deny') || 'Deny'}
          </Button>
        </div>
      )}
      <OGDialog open={denyDialogOpen} onOpenChange={(open) => !open && handleCancelDeny()}>
        <OGDialogContent className="w-full max-w-md border-border-medium bg-surface-primary text-text-primary">
          <OGDialogHeader className="border-b border-border-medium sm:p-3">
            <OGDialogTitle>
              {localize('com_ui_tool_denial_reason_label') || 'Reason for denial (optional)'}
            </OGDialogTitle>
          </OGDialogHeader>
          <div className="flex flex-col gap-3 p-4">
            <Textarea
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              placeholder={
                localize('com_ui_tool_denial_reason_placeholder') ||
                'Explain why you are denying this request. The agent will see this reason.'
              }
              className="min-h-[80px] resize-none"
              disabled={isSubmitting}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleCancelDeny} disabled={isSubmitting}>
                {localize('com_ui_cancel') || 'Cancel'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleConfirmDeny}
                disabled={isSubmitting}
              >
                {localize('com_ui_confirm_denial') || 'Confirm denial'}
              </Button>
            </div>
          </div>
        </OGDialogContent>
      </OGDialog>
      {showExpandButton && (
        <button
          type="button"
          onClick={onToggleExpand}
          className="text-xs text-text-secondary hover:text-text-primary"
        >
          {isExpanded
            ? localize('com_ui_collapse') || 'Collapse'
            : localize('com_ui_expand') || 'Expand'}
        </button>
      )}
    </div>
  );
}
