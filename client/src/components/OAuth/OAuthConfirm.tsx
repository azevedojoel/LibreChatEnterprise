import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLocalize } from '~/hooks';
import { request, mcpOAuthConfirm } from 'librechat-data-provider';
import { broadcastMCPOAuthComplete } from '~/hooks/useMCPOAuthBroadcastListener';

export default function OAuthConfirm() {
  const localize = useLocalize();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const serverName = searchParams.get('serverName') || '';
  const actionId = searchParams.get('actionId') || undefined;
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!token || isConfirming) return;
    setIsConfirming(true);
    setError(null);
    try {
      const response = await request.post(mcpOAuthConfirm(), { token });
      const data = response?.data ?? response;
      if (data?.redirectUrl) {
        broadcastMCPOAuthComplete(serverName || undefined, actionId);
        window.location.href = data.redirectUrl;
        return;
      }
      setError('confirm_failed');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr?.response?.data?.error || 'confirm_failed');
    }
    setIsConfirming(false);
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
          <h1 className="mb-4 text-3xl font-bold text-gray-900">
            {localize('com_ui_oauth_confirm_missing_token') || 'Invalid link'}
          </h1>
          <p className="mb-6 text-sm text-gray-600">
            {localize('com_ui_oauth_confirm_missing_token_desc') ||
              'The confirmation link is invalid or has expired. Please try the authentication process again.'}
          </p>
          <button
            onClick={() => window.close()}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            {localize('com_ui_close_window') || 'Close Window'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
      <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
        <h1 className="mb-4 text-3xl font-bold text-gray-900">
          {localize('com_ui_oauth_confirm_title') || 'Confirm connection'}
        </h1>
        <p className="mb-6 text-sm text-gray-600">
          {serverName
            ? (
                localize('com_ui_oauth_confirm_connecting') ||
                'You are connecting {{0}} to your account.'
              ).replace('{{0}}', serverName)
            : localize('com_ui_oauth_confirm_description') ||
              'You are about to connect an integration to your account.'}{' '}
          {localize('com_ui_oauth_confirm_click') ||
            'Click Confirm to complete, or close this window to cancel.'}
        </p>
        {error && (
          <p className="mb-4 text-sm text-red-600">
            {localize('com_ui_oauth_confirm_error') || 'Confirmation failed. Please try again.'}
          </p>
        )}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleConfirm}
            disabled={isConfirming}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isConfirming
              ? localize('com_ui_loading') || 'Confirming...'
              : localize('com_ui_oauth_confirm_button') || 'Confirm'}
          </button>
          <button
            onClick={() => window.close()}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {localize('com_ui_cancel') || 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
