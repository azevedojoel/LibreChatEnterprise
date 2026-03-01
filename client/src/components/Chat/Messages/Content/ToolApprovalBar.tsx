import { Button } from '@librechat/client';
import { CheckCircle, ShieldAlert, XCircle } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { getToolDisplayName } from '~/utils';

type ToolApprovalBarProps = {
  onApprove: () => void;
  onDeny: () => void;
  onToggleExpand: () => void;
  isExpanded: boolean;
  isSubmitting: boolean;
  /** Tool name for human-readable label (e.g. execute_code, tasks_createTask) */
  toolName?: string;
  /** When set, shows Approved/Denied status instead of Approve/Deny buttons */
  resolved?: 'approved' | 'denied';
};

export default function ToolApprovalBar({
  onApprove,
  onDeny,
  onToggleExpand,
  isExpanded,
  isSubmitting,
  toolName,
  resolved,
}: ToolApprovalBarProps) {
  const localize = useLocalize();
  const label = toolName ? getToolDisplayName(toolName) : (localize('com_ui_tool_approval_required') || 'Tool approval required');

  return (
    <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-2 py-0.5">
      <span className="flex items-center gap-1.5 text-sm text-text-secondary">
        {resolved === 'approved' ? (
          <CheckCircle className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
        ) : resolved === 'denied' ? (
          <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
        ) : (
          <ShieldAlert className="h-4 w-4 shrink-0 text-text-warning" aria-hidden="true" />
        )}
        {resolved === 'approved'
          ? (localize('com_ui_tool_approved') || 'Approved')
          : resolved === 'denied'
            ? (localize('com_ui_tool_denied') || 'Denied')
            : label}
      </span>
      {!resolved && (
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
            onClick={onDeny}
            disabled={isSubmitting}
          >
            {localize('com_ui_deny') || 'Deny'}
          </Button>
        </div>
      )}
      <button
        type="button"
        onClick={onToggleExpand}
        className="text-xs text-text-secondary hover:text-text-primary"
      >
        {isExpanded ? (localize('com_ui_collapse') || 'Collapse') : (localize('com_ui_expand') || 'Expand')}
      </button>
    </div>
  );
}
