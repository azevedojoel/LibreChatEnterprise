import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@librechat/client';
import { ShieldAlert, CheckCircle } from 'lucide-react';
import { useLocalize } from '~/hooks';
import useAuthRedirect from './useAuthRedirect';
import { getPendingToolConfirmation, submitToolConfirmation } from '~/data-provider/SSE/mutations';

export default function ToolApprovalPage() {
  const { isAuthenticated } = useAuthRedirect();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const localize = useLocalize();

  const id = searchParams.get('id') ?? '';

  const [pending, setPending] = useState<{
    toolName: string;
    argsSummary: string;
    conversationId: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resolved, setResolved] = useState<'approved' | 'denied' | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !id) {
      setLoading(false);
      if (isAuthenticated && !id) {
        setError(localize('com_ui_invalid_link') || 'Invalid or expired approval link.');
      }
      return;
    }

    let cancelled = false;
    getPendingToolConfirmation({ id })
      .then((data) => {
        if (!cancelled) {
          setPending(data);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(localize('com_ui_expired') || 'This approval link has expired.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, id, localize]);

  const handleApprove = useCallback(async () => {
    if (!pending) return;
    setSubmitting(true);
    try {
      const result = await submitToolConfirmation({ id, approved: true });
      if (result.success) {
        setResolved('approved');
      } else {
        setError(result.error || 'Failed to submit');
      }
    } catch {
      setError('Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }, [id, pending]);

  const handleDeny = useCallback(async () => {
    if (!pending) return;
    setSubmitting(true);
    try {
      const result = await submitToolConfirmation({ id, approved: false });
      if (result.success) {
        setResolved('denied');
      } else {
        setError(result.error || 'Failed to submit');
      }
    } catch {
      setError('Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }, [id, pending]);

  if (!isAuthenticated) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <p className="text-text-secondary">
          {localize('com_ui_loading') || 'Loading...'}
        </p>
      </div>
    );
  }

  if (error && !pending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <div className="mx-auto max-w-md rounded-xl border border-border-medium bg-surface-primary p-6 shadow-xl">
          <h1 className="text-lg font-semibold text-text-primary">
            {localize('com_ui_tool_approval_required') || 'Tool approval'}
          </h1>
          <p className="mt-2 text-sm text-text-secondary">{error}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => navigate('/c/new', { replace: true })}
          >
            {localize('com_ui_close') || 'Close'}
          </Button>
        </div>
      </div>
    );
  }

  if (resolved) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-xl border border-border-medium bg-surface-primary p-6 shadow-xl">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
            <CheckCircle className="h-5 w-5 shrink-0 text-green-500" aria-hidden="true" />
            {resolved === 'approved'
              ? (localize('com_ui_tool_approved') || 'Approved')
              : (localize('com_ui_tool_denied') || 'Denied')}
          </h1>
          <p className="text-sm text-text-secondary">
            {resolved === 'approved'
              ? (localize('com_ui_tool_approved_message') || 'The tool has been approved and will continue executing.')
              : (localize('com_ui_tool_denied_message') || 'The tool has been denied.')}
          </p>
          {pending && (
            <Button
              variant="outline"
              className="mt-2"
              onClick={() => navigate(`/c/${pending.conversationId}`, { replace: true })}
            >
              {localize('com_ui_view_conversation') || 'View conversation'}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-xl border border-border-medium bg-surface-primary p-6 shadow-xl">
        <h1
          id="tool-approval-page-title"
          className="flex items-center gap-2 text-lg font-semibold text-text-primary"
        >
          <ShieldAlert className="h-5 w-5 shrink-0 text-text-warning" aria-hidden="true" />
          {localize('com_ui_tool_approval_required') || 'Tool approval required'}
        </h1>
        <p className="text-sm text-text-secondary">
          {localize('com_ui_tool_approval_prompt') ||
            'Your agent is requesting to run a potentially destructive tool. Approve or deny to continue.'}
        </p>
        {pending && (
          <div className="rounded-lg border border-border-medium bg-surface-secondary p-3">
            <p className="text-sm font-medium text-text-primary">
              {localize('com_ui_tool_name') || 'Tool'}: {pending.toolName}
            </p>
            {pending.argsSummary && (
              <pre className="mt-2 max-h-32 overflow-auto break-words rounded bg-surface-primary p-2 text-xs text-text-secondary">
                {pending.argsSummary}
              </pre>
            )}
          </div>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button
            variant="default"
            className="min-h-[44px] min-w-[44px]"
            onClick={handleApprove}
            disabled={submitting}
          >
            {localize('com_ui_approve') || 'Approve'}
          </Button>
          <Button
            variant="outline"
            className="min-h-[44px] min-w-[44px]"
            onClick={handleDeny}
            disabled={submitting}
          >
            {localize('com_ui_deny') || 'Deny'}
          </Button>
        </div>
      </div>
    </div>
  );
}
