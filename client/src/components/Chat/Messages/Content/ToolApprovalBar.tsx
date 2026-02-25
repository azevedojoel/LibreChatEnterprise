import { Button } from '@librechat/client';
import { ShieldAlert } from 'lucide-react';
import { useLocalize } from '~/hooks';

type ToolApprovalBarProps = {
  onApprove: () => void;
  onDeny: () => void;
  onToggleExpand: () => void;
  isExpanded: boolean;
  isSubmitting: boolean;
};

export default function ToolApprovalBar({
  onApprove,
  onDeny,
  onToggleExpand,
  isExpanded,
  isSubmitting,
}: ToolApprovalBarProps) {
  const localize = useLocalize();

  return (
    <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-2 py-0.5">
      <span className="flex items-center gap-1.5 text-sm text-text-secondary">
        <ShieldAlert className="h-4 w-4 shrink-0 text-text-warning" aria-hidden="true" />
        {localize('com_ui_tool_approval_required') || 'Tool approval required'}
      </span>
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
