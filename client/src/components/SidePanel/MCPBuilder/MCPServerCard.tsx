import { useState, useRef, useCallback } from 'react';
import { MCPIcon, Button, Spinner, OGDialog, OGDialogTemplate, useToastContext } from '@librechat/client';
import { PermissionBits, hasPermissions } from 'librechat-data-provider';
import type { MCPServerStatusIconProps } from '~/components/MCP/MCPServerStatusIcon';
import type { MCPServerDefinition } from '~/hooks';
import MCPServerDialog from './MCPServerDialog';
import { getStatusDotColor } from './MCPStatusBadge';
import MCPCardActions from './MCPCardActions';
import { useMCPServerManager, useLocalize } from '~/hooks';
import { useDeleteMCPServerMutation } from '~/data-provider/MCP';
import { cn } from '~/utils';

interface MCPServerCardProps {
  server: MCPServerDefinition;
  getServerStatusIconProps: (serverName: string) => MCPServerStatusIconProps;
  canCreateEditMCPs: boolean;
}

/**
 * Compact card component for displaying an MCP server with status and actions.
 *
 * Visual design:
 * - Status shown via colored dot on icon (no separate badge - avoids redundancy)
 * - Action buttons clearly indicate available operations
 * - Consistent with MCPServerMenuItem in chat dropdown
 */
export default function MCPServerCard({
  server,
  getServerStatusIconProps,
  canCreateEditMCPs,
}: MCPServerCardProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const triggerRef = useRef<HTMLDivElement>(null);
  const { initializeServer, revokeOAuthForServer } = useMCPServerManager();
  const deleteMutation = useDeleteMCPServerMutation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const statusIconProps = getServerStatusIconProps(server.serverName);
  const {
    serverStatus,
    onConfigClick,
    isInitializing,
    canCancel,
    onCancel,
    hasCustomUserVars = false,
  } = statusIconProps;

  const canEditThisServer = hasPermissions(server.effectivePermissions, PermissionBits.EDIT);
  const displayName = server.config?.title || server.serverName;
  const description = server.config?.description;
  const statusDotColor = getStatusDotColor(serverStatus, isInitializing);
  const canEdit = canCreateEditMCPs && canEditThisServer;
  const canDelete = canCreateEditMCPs && !!server.dbId;

  const handleInitialize = () => {
    /** If server has custom user vars and is not already connected, show config dialog first
     *  This ensures users can enter credentials before initialization attempts
     */
    if (hasCustomUserVars && serverStatus?.connectionState !== 'connected') {
      onConfigClick({ stopPropagation: () => {}, preventDefault: () => {} } as React.MouseEvent);
      return;
    }
    initializeServer(server.serverName);
  };

  const handleRevoke = () => {
    revokeOAuthForServer(server.serverName);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDialogOpen(true);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setShowDeleteConfirm(true);
  };

  const handleDelete = useCallback(async () => {
    try {
      await deleteMutation.mutateAsync(server.serverName);
      showToast({
        message: localize('com_ui_mcp_server_deleted'),
        status: 'success',
      });
      setShowDeleteConfirm(false);
      setDialogOpen(false);
    } catch (error: unknown) {
      let errorMessage = localize('com_ui_error');
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: { error?: string } } };
        if (axiosError.response?.data?.error) {
          errorMessage = axiosError.response.data.error;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      showToast({ message: errorMessage, status: 'error' });
    }
  }, [server.serverName, deleteMutation, showToast, localize]);

  // Determine status text for accessibility
  const getStatusText = () => {
    if (isInitializing) return localize('com_nav_mcp_status_initializing');
    if (!serverStatus) return localize('com_nav_mcp_status_unknown');
    const { connectionState, requiresOAuth } = serverStatus;
    if (connectionState === 'connected') return localize('com_nav_mcp_status_connected');
    if (connectionState === 'connecting') return localize('com_nav_mcp_status_connecting');
    if (connectionState === 'error') return localize('com_nav_mcp_status_error');
    if (connectionState === 'disconnected') {
      return requiresOAuth
        ? localize('com_nav_mcp_status_needs_auth')
        : localize('com_nav_mcp_status_disconnected');
    }
    return localize('com_nav_mcp_status_unknown');
  };

  return (
    <>
      {/* Delete confirmation dialog */}
      <OGDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <OGDialogTemplate
          title={localize('com_ui_delete_mcp_server')}
          className="w-11/12 max-w-md"
          description={localize('com_ui_mcp_server_delete_confirm', { 0: server.serverName })}
          selection={
            <Button
              onClick={handleDelete}
              variant="destructive"
              aria-live="polite"
              disabled={deleteMutation.isPending}
              aria-label={
                deleteMutation.isPending ? localize('com_ui_deleting') : localize('com_ui_delete')
              }
            >
              {deleteMutation.isPending ? <Spinner /> : localize('com_ui_delete')}
            </Button>
          }
        />
      </OGDialog>

      <div
        className={cn(
          'group flex items-center gap-3 rounded-lg px-3 py-2.5',
          'border border-border-light bg-transparent',
        )}
        aria-label={`${displayName} - ${getStatusText()}`}
      >
        {/* Server Icon with Status Dot */}
        <div className="relative flex-shrink-0">
          {server.config?.iconPath ? (
            <img
              src={server.config.iconPath}
              className="size-8 rounded-lg object-cover"
              alt=""
              aria-hidden="true"
            />
          ) : (
            <div className="flex size-8 items-center justify-center rounded-lg bg-surface-tertiary">
              <MCPIcon className="size-5 text-text-secondary" aria-hidden="true" />
            </div>
          )}
          {/* Status dot - color indicates connection state */}
          <div
            className={cn(
              'absolute -bottom-0.5 -right-0.5 size-3 rounded-full',
              'border-2 border-surface-primary',
              statusDotColor,
              (isInitializing || serverStatus?.connectionState === 'connecting') && 'animate-pulse',
            )}
            aria-hidden="true"
          />
        </div>

        {/* Server Info */}
        <div className="min-w-0 flex-1">
          <span className="truncate text-sm font-medium text-text-primary">{displayName}</span>
          {description && <p className="truncate text-xs text-text-secondary">{description}</p>}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0">
          <MCPCardActions
            serverName={server.serverName}
            serverStatus={serverStatus}
            isInitializing={isInitializing}
            canCancel={canCancel}
            hasCustomUserVars={hasCustomUserVars}
            canEdit={canEdit}
            canDelete={canDelete}
            editButtonRef={triggerRef}
            onEditClick={handleEditClick}
            onConfigClick={onConfigClick}
            onInitialize={handleInitialize}
            onCancel={onCancel}
            onRevoke={handleRevoke}
            onDelete={handleDeleteClick}
          />
        </div>
      </div>

      {/* Edit Dialog - separate from card */}
      {canEdit && (
        <MCPServerDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          triggerRef={triggerRef}
          server={server}
        />
      )}
    </>
  );
}
