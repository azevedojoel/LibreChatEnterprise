import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SystemRoles } from 'librechat-data-provider';
import {
  Button,
  Input,
  Label,
  OGDialog,
  OGDialogTemplate,
  Spinner,
  useToastContext,
} from '@librechat/client';
import { Building2, Mail, Pencil, Plus, Trash2, UserMinus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import {
  useGetAdminWorkspacesQuery,
  useGetAdminWorkspaceQuery,
  useGetAdminWorkspaceMembersQuery,
  useGetAdminWorkspaceInvitesQuery,
  useCreateAdminWorkspaceMutation,
  useUpdateAdminWorkspaceMutation,
  useDeleteAdminWorkspaceMutation,
  useInviteAdminWorkspaceMemberMutation,
  useRemoveAdminWorkspaceMemberMutation,
} from '~/data-provider';
import type { TWorkspace } from '~/data-provider';
import { useAuthContext } from '~/hooks';
import { useLocalize } from '~/hooks';
import { useGetAgentsConfig } from '~/hooks/Agents';
import DashBreadcrumb from '~/routes/Layouts/DashBreadcrumb';
import { cn } from '~/utils';

function WorkspacesView() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { agentsConfig } = useGetAgentsConfig();

  const [createOpen, setCreateOpen] = useState(false);
  const [editWorkspace, setEditWorkspace] = useState<TWorkspace | null>(null);
  const [deleteWorkspace, setDeleteWorkspace] = useState<TWorkspace | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<TWorkspace | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [addAdminMemberId, setAddAdminMemberId] = useState<string>('');

  const inboundDomain =
    agentsConfig?.inboundEmailDisplayDomain ?? agentsConfig?.inboundEmailAddress ?? 'dailythread.ai';

  const { data: workspaces = [], isLoading } = useGetAdminWorkspacesQuery({
    enabled: !!user && user.role === SystemRoles.ADMIN,
  });

  const workspaceId = selectedWorkspace?.id ?? selectedWorkspace?._id ?? '';
  const { data: workspaceData } = useGetAdminWorkspaceQuery(workspaceId, {
    enabled: !!workspaceId,
  });
  const { data: membersData, isLoading: membersLoading } = useGetAdminWorkspaceMembersQuery(
    workspaceId,
    { enabled: !!selectedWorkspace },
  );
  const { data: invitesData, isLoading: invitesLoading } = useGetAdminWorkspaceInvitesQuery(
    workspaceId,
    { enabled: !!selectedWorkspace },
  );
  const members = membersData?.members ?? [];
  const invites = invitesData?.invites ?? [];

  const queryClient = useQueryClient();
  const createMutation = useCreateAdminWorkspaceMutation();
  const updateMutation = useUpdateAdminWorkspaceMutation();
  const deleteMutation = useDeleteAdminWorkspaceMutation();
  const inviteMutation = useInviteAdminWorkspaceMemberMutation();
  const removeMemberMutation = useRemoveAdminWorkspaceMemberMutation();

  const mutationCallbacks = {
    create: {
      onSuccess: () => {
        showToast({ message: localize('com_ui_workspace_created'), status: 'success' });
        setCreateOpen(false);
      },
      onError: (error: Error) => {
        const msg = (error as any)?.response?.data?.message ?? error.message;
        showToast({ message: msg, status: 'error' });
      },
    },
    update: {
      onSuccess: () => {
        showToast({ message: localize('com_ui_workspace_updated'), status: 'success' });
        setEditWorkspace(null);
      },
      onError: (error: Error) => {
        const msg = (error as any)?.response?.data?.message ?? error.message;
        showToast({ message: msg, status: 'error' });
      },
    },
    delete: {
      onSuccess: () => {
        showToast({ message: localize('com_ui_workspace_deleted'), status: 'success' });
        setDeleteWorkspace(null);
        setSelectedWorkspace(null);
      },
      onError: (error: Error) => {
        const msg = (error as any)?.response?.data?.message ?? error.message;
        showToast({ message: msg, status: 'error' });
      },
    },
    invite: {
      onSuccess: (data) => {
        const msg = data.user
          ? localize('com_ui_user_added_to_workspace')
          : data.link
            ? localize('com_ui_invite_user_email_not_configured')
            : localize('com_ui_invite_user_success');
        showToast({ message: msg, status: 'success' });
        setInviteEmail('');
      },
      onError: (error: Error) => {
        const msg = (error as any)?.response?.data?.message ?? error.message;
        showToast({ message: msg, status: 'error' });
      },
    },
    removeMember: {
      onSuccess: () => {
        showToast({ message: localize('com_ui_member_removed'), status: 'success' });
      },
      onError: (error: Error) => {
        const msg = (error as any)?.response?.data?.message ?? error.message;
        showToast({ message: msg, status: 'error' });
      },
    },
  };

  React.useEffect(() => {
    if (user && user.role !== SystemRoles.ADMIN) {
      navigate('/c/new', { replace: true });
    }
  }, [user, navigate]);

  if (!user || user.role !== SystemRoles.ADMIN) {
    return null;
  }

  const handleCreate = (name: string, slug: string) => {
    createMutation.mutate(
      { name: name.trim(), slug: slug.trim().toLowerCase() },
      mutationCallbacks.create,
    );
  };

  const handleUpdate = (id: string, name: string, slug: string, maxMembers?: number) => {
    updateMutation.mutate(
      {
        id,
        data: {
          name: name.trim(),
          slug: slug.trim().toLowerCase(),
          ...(maxMembers != null && { maxMembers }),
        },
      },
      mutationCallbacks.update,
    );
  };

  const handleInvite = () => {
    if (!selectedWorkspace || !inviteEmail.trim()) return;
    inviteMutation.mutate(
      {
        id: selectedWorkspace.id ?? selectedWorkspace._id,
        email: inviteEmail.trim(),
      },
      mutationCallbacks.invite,
    );
  };

  const workspace = workspaceData ?? selectedWorkspace;
  const effectiveAdminIds =
    (workspace?.adminIds?.length ?? 0) > 0
      ? (workspace?.adminIds ?? []).map(String)
      : workspace?.createdBy
        ? [String(workspace.createdBy)]
        : [];
  const adminMembers = members.filter((m) =>
    effectiveAdminIds.some((aid) => (aid && String(aid)) === (m.id ?? m._id)),
  );
  const nonAdminMembers = members.filter(
    (m) => !effectiveAdminIds.some((aid) => (aid && String(aid)) === (m.id ?? m._id)),
  );
  const canRemoveAdmin = effectiveAdminIds.length > 1;

  const handleAddAdmin = () => {
    if (!workspace || !addAdminMemberId) return;
    const wid = workspace.id ?? workspace._id;
    const newAdminIds =
      effectiveAdminIds.length > 0
        ? [...effectiveAdminIds, addAdminMemberId]
        : workspace.createdBy
          ? [String(workspace.createdBy), addAdminMemberId]
          : [addAdminMemberId];
    updateMutation.mutate(
      {
        id: wid,
        data: { adminIds: newAdminIds },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries([QueryKeys.adminWorkspace, wid]);
          showToast({ message: localize('com_ui_workspace_updated'), status: 'success' });
          setAddAdminMemberId('');
        },
        onError: (error: Error) => {
          const msg = (error as any)?.response?.data?.message ?? error.message;
          showToast({ message: msg, status: 'error' });
        },
      },
    );
  };

  const handleRemoveAdmin = (memberId: string) => {
    if (!workspace || !canRemoveAdmin) return;
    const wid = workspace.id ?? workspace._id;
    const newAdminIds = effectiveAdminIds.filter((id) => id !== memberId);
    updateMutation.mutate(
      {
        id: wid,
        data: { adminIds: newAdminIds },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries([QueryKeys.adminWorkspace, wid]);
          showToast({ message: localize('com_ui_workspace_updated'), status: 'success' });
        },
        onError: (error: Error) => {
          const msg = (error as any)?.response?.data?.message ?? error.message;
          showToast({ message: msg, status: 'error' });
        },
      },
    );
  };

  return (
    <div className="flex h-screen w-full flex-col bg-surface-primary p-0 lg:p-2">
      <DashBreadcrumb />
      <div className="flex w-full flex-grow flex-col overflow-hidden p-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-text-primary">{localize('com_ui_workspaces')}</h1>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="size-5" />
            {localize('com_ui_create_workspace')}
          </Button>
        </div>

          <div className="flex flex-1 gap-4 overflow-hidden">
          <div className="flex w-80 flex-col overflow-y-auto rounded-lg border border-border-medium bg-surface-primary shadow-sm">
            {isLoading ? (
              <div className="flex flex-1 items-center justify-center p-8">
                <Spinner className="size-8" />
              </div>
            ) : workspaces.length === 0 ? (
              <div className="p-8 text-center text-text-secondary">
                {localize('com_ui_no_workspaces')}
              </div>
            ) : (
              <div className="divide-y divide-border-medium">
                {workspaces.map((ws) => (
                  <button
                    key={ws.id ?? ws._id}
                    type="button"
                    onClick={() => setSelectedWorkspace(ws)}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-3 text-left text-text-primary transition-colors hover:bg-surface-hover',
                      selectedWorkspace?.id === ws.id || selectedWorkspace?._id === ws._id
                        ? 'bg-surface-secondary'
                        : '',
                    )}
                  >
                    <Building2 className="size-5 shrink-0 text-text-secondary" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{ws.name}</div>
                      <div className="truncate text-sm text-text-secondary">
                        {ws.slug}@{inboundDomain}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedWorkspace && (
            <div className="flex flex-1 flex-col overflow-y-auto rounded-lg border border-border-medium bg-surface-primary p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">{selectedWorkspace.name}</h2>
                  <p className="text-sm text-text-secondary">
                    {localize('com_ui_workspace_email')}: {selectedWorkspace.slug}@{inboundDomain}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    title={localize('com_ui_edit_workspace')}
                    className="border-border-medium text-text-primary hover:bg-surface-hover"
                    onClick={() => setEditWorkspace(workspace ?? selectedWorkspace)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    title={localize('com_ui_delete_workspace')}
                    className="border-border-medium text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/20 dark:hover:text-red-300"
                    onClick={() => setDeleteWorkspace(selectedWorkspace)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="mb-4">
                <Label className="mb-2 block text-text-primary">{localize('com_ui_invite_by_email')}</Label>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="user@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="flex-1 border-border-medium bg-surface-secondary text-text-primary placeholder:text-text-secondary"
                  />
                  <Button
                    onClick={handleInvite}
                    disabled={!inviteEmail.trim() || inviteMutation.isLoading}
                  >
                    <Mail className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="mb-4">
                <h3 className="mb-2 font-medium text-text-primary">{localize('com_ui_invites')}</h3>
                {invitesLoading ? (
                  <Spinner className="size-6" />
                ) : invites.length === 0 ? (
                  <p className="text-sm text-text-secondary">{localize('com_ui_no_invites')}</p>
                ) : (
                  <ul className="divide-y divide-border-medium">
                    {invites.map((inv) => (
                      <li
                        key={inv.id ?? inv._id}
                        className="flex items-center justify-between rounded-lg py-2 px-2 transition-colors hover:bg-surface-hover"
                      >
                        <span className="font-medium text-text-primary">{inv.email}</span>
                        <span
                          className={cn(
                            'rounded px-2 py-0.5 text-xs font-medium',
                            inv.status === 'pending' &&
                              'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
                            inv.status === 'accepted' &&
                              'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
                            inv.status === 'expired' &&
                              'bg-surface-secondary text-text-secondary',
                          )}
                        >
                          {inv.status === 'pending' && localize('com_ui_invite_status_pending')}
                          {inv.status === 'accepted' && localize('com_ui_invite_status_accepted')}
                          {inv.status === 'expired' && localize('com_ui_invite_status_expired')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mb-4">
                <h3 className="mb-2 font-medium text-text-primary">
                  {localize('com_ui_workspace_admins')}
                </h3>
                {membersLoading ? (
                  <Spinner className="size-6" />
                ) : adminMembers.length === 0 ? (
                  <p className="text-sm text-text-secondary">{localize('com_ui_no_admins')}</p>
                ) : (
                  <ul className="mb-3 divide-y divide-border-medium">
                    {adminMembers.map((m) => (
                      <li
                        key={m.id ?? m._id}
                        className="flex items-center justify-between rounded-lg py-2 px-2 transition-colors hover:bg-surface-hover"
                      >
                        <div>
                          <span className="font-medium text-text-primary">{m.email}</span>
                          {m.name && (
                            <span className="ml-2 text-sm text-text-secondary">({m.name})</span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          title={localize('com_ui_remove_admin')}
                          disabled={!canRemoveAdmin}
                          className="text-red-600 hover:bg-red-500/10 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-500/20 dark:hover:text-red-300"
                          onClick={() => handleRemoveAdmin(m.id ?? m._id)}
                        >
                          <UserMinus className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {nonAdminMembers.length > 0 && (
                  <div className="flex gap-2">
                    <select
                      value={addAdminMemberId}
                      onChange={(e) => setAddAdminMemberId(e.target.value)}
                      className="flex-1 rounded-lg border border-border-medium bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                    >
                      <option value="">
                        {localize('com_ui_select_member_to_add_admin')}
                      </option>
                      {nonAdminMembers.map((m) => (
                        <option key={m.id ?? m._id} value={m.id ?? m._id}>
                          {m.email}
                          {m.name ? ` (${m.name})` : ''}
                        </option>
                      ))}
                    </select>
                    <Button
                      onClick={handleAddAdmin}
                      disabled={!addAdminMemberId || updateMutation.isLoading}
                    >
                      {localize('com_ui_add_admin')}
                    </Button>
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 font-medium text-text-primary">{localize('com_ui_members')}</h3>
                {membersLoading ? (
                  <Spinner className="size-6" />
                ) : nonAdminMembers.length === 0 ? (
                  <p className="text-sm text-text-secondary">{localize('com_ui_no_members')}</p>
                ) : (
                  <ul className="divide-y divide-border-medium">
                    {nonAdminMembers.map((m) => (
                      <li
                        key={m.id ?? m._id}
                        className="flex items-center justify-between rounded-lg py-2 px-2 transition-colors hover:bg-surface-hover"
                      >
                        <div>
                          <span className="font-medium text-text-primary">{m.email}</span>
                          {m.name && (
                            <span className="ml-2 text-sm text-text-secondary">({m.name})</span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          title={localize('com_ui_remove_member')}
                          className="text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/20 dark:hover:text-red-300"
                          onClick={() =>
                            removeMemberMutation.mutate(
                              {
                                id: selectedWorkspace.id ?? selectedWorkspace._id,
                                userId: m.id ?? m._id,
                              },
                              mutationCallbacks.removeMember,
                            )
                          }
                        >
                          <UserMinus className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {createOpen && (
        <CreateWorkspaceDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSubmit={handleCreate}
          isLoading={createMutation.isLoading}
        />
      )}
      {editWorkspace && (
        <EditWorkspaceDialog
          workspace={editWorkspace}
          open={!!editWorkspace}
          onOpenChange={(open) => !open && setEditWorkspace(null)}
          onSubmit={handleUpdate}
          isLoading={updateMutation.isLoading}
        />
      )}
      {deleteWorkspace && (
        <DeleteWorkspaceDialog
          workspace={deleteWorkspace}
          open={!!deleteWorkspace}
          onOpenChange={(open) => !open && setDeleteWorkspace(null)}
          onConfirm={() => {
            deleteMutation.mutate(deleteWorkspace.id ?? deleteWorkspace._id, mutationCallbacks.delete);
          }}
          isLoading={deleteMutation.isLoading}
        />
      )}
    </div>
  );
}

function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string, slug: string) => void;
  isLoading: boolean;
}) {
  const localize = useLocalize();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && slug.trim()) {
      onSubmit(name, slug);
    }
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogTemplate
        title={localize('com_ui_create_workspace')}
        showCloseButton
        className="max-w-md"
        main={
          <form id="create-workspace-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-text-primary">{localize('com_ui_name')}</Label>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
                }}
                placeholder="Company X"
                required
                className="mt-1 w-full border-border-medium bg-surface-secondary text-text-primary placeholder:text-text-secondary"
              />
            </div>
            <div>
              <Label className="text-text-primary">{localize('com_ui_slug')}</Label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="companyx"
                required
                className="mt-1 w-full border-border-medium bg-surface-secondary text-text-primary placeholder:text-text-secondary"
              />
              <p className="mt-1 text-xs text-text-secondary">
                {localize('com_ui_slug_hint')}
              </p>
            </div>
          </form>
        }
        buttons={
          <Button type="submit" form="create-workspace-form" disabled={isLoading}>
            {localize('com_ui_create')}
          </Button>
        }
      />
    </OGDialog>
  );
}

function EditWorkspaceDialog({
  workspace,
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: {
  workspace: TWorkspace;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (id: string, name: string, slug: string, maxMembers?: number) => void;
  isLoading: boolean;
}) {
  const localize = useLocalize();
  const [name, setName] = useState(workspace.name);
  const [slug, setSlug] = useState(workspace.slug);
  const [maxMembers, setMaxMembers] = useState(
    workspace.maxMembers ?? 3,
  );

  React.useEffect(() => {
    setName(workspace.name);
    setSlug(workspace.slug);
    setMaxMembers(workspace.maxMembers ?? 3);
  }, [workspace]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && slug.trim()) {
      onSubmit(workspace.id ?? workspace._id, name, slug, maxMembers);
    }
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogTemplate
        title={localize('com_ui_edit_workspace')}
        showCloseButton
        className="max-w-md"
        main={
          <form id="edit-workspace-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-text-primary">{localize('com_ui_name')}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Company X"
                required
                className="mt-1 w-full border-border-medium bg-surface-secondary text-text-primary placeholder:text-text-secondary"
              />
            </div>
            <div>
              <Label className="text-text-primary">{localize('com_ui_slug')}</Label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="companyx"
                required
                className="mt-1 w-full border-border-medium bg-surface-secondary text-text-primary placeholder:text-text-secondary"
              />
            </div>
            <div>
              <Label className="text-text-primary">
                {localize('com_ui_max_members')}
              </Label>
              <Input
                type="number"
                min={1}
                value={maxMembers}
                onChange={(e) => setMaxMembers(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="mt-1 w-full border-border-medium bg-surface-secondary text-text-primary"
              />
              <p className="mt-1 text-xs text-text-secondary">
                {localize('com_ui_max_members_hint')}
              </p>
            </div>
          </form>
        }
        buttons={
          <Button type="submit" form="edit-workspace-form" disabled={isLoading}>
            {localize('com_ui_save')}
          </Button>
        }
      />
    </OGDialog>
  );
}

function DeleteWorkspaceDialog({
  workspace,
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: {
  workspace: TWorkspace;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading: boolean;
}) {
  const localize = useLocalize();

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogTemplate
        title={localize('com_ui_delete_workspace')}
        showCloseButton
        className="max-w-md"
        main={
          <p className="text-text-secondary">
            {localize('com_ui_delete_workspace_confirm').replace('{{name}}', workspace.name)}
          </p>
        }
        buttons={
          <Button variant="destructive" onClick={onConfirm} disabled={isLoading}>
            {localize('com_ui_delete')}
          </Button>
        }
      />
    </OGDialog>
  );
}

export default WorkspacesView;
