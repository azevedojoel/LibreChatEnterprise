import React, { useState, useCallback } from 'react';
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
import { Mail, Pencil, Plus, Trash2 } from 'lucide-react';
import MultiConvoAdminSettings from './MultiConvoAdminSettings';
import PresetsAdminSettings from './PresetsAdminSettings';
import EndpointsMenuAdminSettings from './EndpointsMenuAdminSettings';
import {
  useGetAdminUsersQuery,
  useCreateAdminUserMutation,
  useUpdateAdminUserMutation,
  useDeleteAdminUserMutation,
  useSendAdminPasswordResetMutation,
} from '~/data-provider';
import type { TAdminUser } from 'librechat-data-provider';
import { useLocalize, useAuthContext } from '~/hooks';
import { cn } from '~/utils';

const PAGE_SIZE = 20;

function UserManagement() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { user: currentUser } = useAuthContext();

  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<TAdminUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<TAdminUser | null>(null);


  const { data, isLoading } = useGetAdminUsersQuery(
    { limit: PAGE_SIZE, page: page + 1, search: search || undefined },
    { enabled: !!currentUser },
  );

  const createMutation = useCreateAdminUserMutation({
    onSuccess: () => {
      showToast({ message: localize('com_ui_user_created'), status: 'success' });
      setCreateOpen(false);
    },
    onError: (error: Error) => {
      const msg = (error as any)?.response?.data?.error ?? error.message;
      showToast({ message: msg, status: 'error' });
    },
  });

  const updateMutation = useUpdateAdminUserMutation({
    onSuccess: () => {
      showToast({ message: localize('com_ui_user_updated'), status: 'success' });
      setEditUser(null);
    },
    onError: (error: Error) => {
      const msg = (error as any)?.response?.data?.error ?? error.message;
      showToast({ message: msg, status: 'error' });
    },
  });

  const deleteMutation = useDeleteAdminUserMutation({
    onSuccess: () => {
      showToast({ message: localize('com_ui_user_deleted'), status: 'success' });
      setDeleteUser(null);
    },
    onError: (error: Error) => {
      const msg = (error as any)?.response?.data?.error ?? error.message;
      showToast({ message: msg, status: 'error' });
    },
  });

  const sendResetEmailMutation = useSendAdminPasswordResetMutation({
    onSuccess: () => {
      showToast({ message: localize('com_ui_reset_email_sent'), status: 'success' });
    },
    onError: (error: Error) => {
      const msg = (error as any)?.response?.data?.error ?? error.message;
      showToast({ message: msg, status: 'error' });
    },
  });

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleCreate = useCallback(
    (payload: { email: string; name?: string; username?: string; password?: string; role?: string; emailVerified?: boolean }) => {
      createMutation.mutate(payload);
    },
    [createMutation],
  );

  const handleUpdate = useCallback(
    (userId: string, payload: { email?: string; name?: string; username?: string; role?: string; emailVerified?: boolean }) => {
      updateMutation.mutate({ userId, data: payload });
    },
    [updateMutation],
  );

  const handleDeleteConfirm = useCallback(() => {
    if (deleteUser) {
      deleteMutation.mutate(deleteUser.id ?? deleteUser._id ?? '');
    }
  }, [deleteUser, deleteMutation]);

  return (
    <div className="flex flex-col gap-4 p-4 text-base text-text-primary">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <Input
            type="text"
            placeholder={localize('com_ui_search')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="max-w-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <MultiConvoAdminSettings />
          <PresetsAdminSettings />
          <EndpointsMenuAdminSettings />
          <Button
            onClick={() => setCreateOpen(true)}
            className="gap-2"
            aria-label={localize('com_ui_create_user')}
          >
            <Plus className="size-5" />
            {localize('com_ui_create_user')}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border-medium">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="size-8" />
          </div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center text-text-secondary">
            {search ? localize('com_ui_no_results') : localize('com_ui_no_users')}
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border-medium bg-surface-secondary">
                <th className="px-5 py-3 font-medium">{localize('com_ui_user_email')}</th>
                <th className="px-5 py-3 font-medium">{localize('com_ui_user_name')}</th>
                <th className="px-5 py-3 font-medium">{localize('com_ui_user_role')}</th>
                <th className="px-5 py-3 font-medium">{localize('com_ui_user_provider')}</th>
                <th className="px-5 py-3 font-medium text-right">{localize('com_ui_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id ?? user._id ?? user.email}
                  className="border-b border-border-light last:border-b-0 hover:bg-surface-secondary/50"
                >
                  <td className="px-5 py-3">{user.email}</td>
                  <td className="px-5 py-3">{user.name || '-'}</td>
                  <td className="px-5 py-3">{user.role}</td>
                  <td className="px-5 py-3">{user.provider || 'local'}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {user.provider === 'local' && (
                        <Button
                          variant="ghost"
                          onClick={() => sendResetEmailMutation.mutate(user.id ?? user._id ?? '')}
                          disabled={sendResetEmailMutation.isLoading}
                          aria-label={localize('com_ui_send_reset_email')}
                          title={localize('com_ui_send_reset_email_tooltip')}
                        >
                          <Mail className="size-5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        onClick={() => setEditUser(user)}
                        aria-label={localize('com_ui_edit_user')}
                      >
                        <Pencil className="size-5" />
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setDeleteUser(user)}
                        disabled={(user.id ?? user._id) === currentUser?.id}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                        aria-label={localize('com_ui_delete_user')}
                      >
                        <Trash2 className="size-5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            {localize('com_ui_prev')}
          </Button>
          <span className="text-text-secondary">
            {page + 1} / {totalPages} ({total} {localize('com_ui_users')})
          </span>
          <Button
            variant="outline"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            {localize('com_ui_next')}
          </Button>
        </div>
      )}

      {/* Create User Dialog */}
      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        isLoading={createMutation.isLoading}
      />

      {/* Edit User Dialog */}
      {editUser && (
        <EditUserDialog
          key={editUser.id ?? editUser._id}
          user={editUser}
          open={!!editUser}
          onOpenChange={(open) => !open && setEditUser(null)}
          onSubmit={(payload) => handleUpdate(editUser.id ?? editUser._id ?? '', payload)}
          isLoading={updateMutation.isLoading}
          isEditingSelf={(editUser.id ?? editUser._id) === currentUser?.id}
        />
      )}

      {/* Delete Confirmation */}
      {deleteUser && (
        <OGDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
          <OGDialogTemplate
            title={localize('com_ui_confirm_delete_user')}
            showCloseButton
            className="max-w-md"
            main={
              <p className="text-text-primary">
                {localize('com_ui_confirm_delete_user_message', { email: deleteUser.email })}
              </p>
            }
            buttons={
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDeleteUser(null)}
                  disabled={deleteMutation.isLoading}
                >
                  {localize('com_ui_cancel')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteConfirm}
                  disabled={deleteMutation.isLoading}
                >
                  {deleteMutation.isLoading ? (
                    <Spinner className="size-4" />
                  ) : (
                    localize('com_ui_delete')
                  )}
                </Button>
              </div>
            }
          />
        </OGDialog>
      )}
    </div>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { email: string; name?: string; username?: string; password?: string; role?: string }) => void;
  isLoading: boolean;
}) {
  const localize = useLocalize();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(SystemRoles.USER);
  const [generatePassword, setGeneratePassword] = useState(false);

  const handleGeneratePassword = () => {
    setPassword(Math.random().toString(36).slice(-12) + 'A1!');
    setGeneratePassword(true);
  };

  const handleSubmit = () => {
    if (!email?.trim() || !email.includes('@')) {
      return;
    }
    const finalPassword =
      password && password.length >= 8 ? password : undefined;
    onSubmit({
      email: email.trim().toLowerCase(),
      name: name.trim() || undefined,
      username: username.trim() || undefined,
      password: finalPassword,
      role,
    });
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogTemplate
        title={localize('com_ui_create_user')}
        showCloseButton
        className="max-w-md"
        main={
          <div className="flex flex-col gap-4">
            <div>
              <Label className="text-text-primary">{localize('com_ui_user_email')} *</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="mt-1 w-full"
              />
            </div>
            <div>
              <Label className="text-text-primary">{localize('com_ui_user_name')}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={localize('com_ui_user_name_placeholder')}
                className="mt-1 w-full"
              />
            </div>
            <div>
              <Label className="text-text-primary">{localize('com_ui_user_username')}</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={localize('com_ui_user_username_placeholder')}
                className="mt-1 w-full"
              />
            </div>
            <div>
              <Label className="text-text-primary">{localize('com_ui_password')}</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={localize('com_ui_password_placeholder')}
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={handleGeneratePassword}>
                  {localize('com_ui_generate')}
                </Button>
              </div>
              <p className="mt-1 text-xs text-text-secondary">{localize('com_ui_password_hint')}</p>
            </div>
            <div>
              <Label className="text-text-primary">{localize('com_ui_user_role')}</Label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as SystemRoles)}
                className={cn(
                  'mt-1 w-full rounded-lg border border-border-light bg-transparent px-3 py-2',
                  'text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-heavy',
                )}
              >
                <option value={SystemRoles.USER}>{SystemRoles.USER}</option>
                <option value={SystemRoles.ADMIN}>{SystemRoles.ADMIN}</option>
              </select>
            </div>
          </div>
        }
        buttons={
          <Button
            variant="submit"
            onClick={handleSubmit}
            disabled={isLoading || !email?.trim() || !email.includes('@')}
          >
            {isLoading ? <Spinner className="size-4" /> : localize('com_ui_create')}
          </Button>
        }
      />
    </OGDialog>
  );
}

function EditUserDialog({
  user,
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  isEditingSelf,
}: {
  user: TAdminUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { email?: string; name?: string; username?: string; role?: string; emailVerified?: boolean }) => void;
  isLoading: boolean;
  isEditingSelf?: boolean;
}) {
  const localize = useLocalize();
  const [email, setEmail] = useState(user.email);
  const [name, setName] = useState(user.name || '');
  const [username, setUsername] = useState(user.username || '');
  const [role, setRole] = useState(user.role ?? SystemRoles.USER);
  const [emailVerified, setEmailVerified] = useState(user.emailVerified ?? true);

  const handleSubmit = () => {
    if (!email?.trim() || !email.includes('@')) {
      return;
    }
    const payload: { email?: string; name?: string; username?: string; role?: string; emailVerified?: boolean } = {
      name: name.trim() || undefined,
      username: username.trim() || undefined,
      emailVerified,
    };
    if (!isEditingSelf) {
      payload.email = email.trim().toLowerCase();
      payload.role = role;
    }
    onSubmit(payload);
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogTemplate
        title={localize('com_ui_edit_user')}
        showCloseButton
        className="max-w-md"
        main={
          <div className="flex flex-col gap-4">
            <div>
              <Label className="text-text-primary">{localize('com_ui_user_email')} *</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="mt-1 w-full"
                disabled={isEditingSelf}
                readOnly={isEditingSelf}
              />
            </div>
            <div>
              <Label className="text-text-primary">{localize('com_ui_user_name')}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={localize('com_ui_user_name_placeholder')}
                className="mt-1 w-full"
              />
            </div>
            <div>
              <Label className="text-text-primary">{localize('com_ui_user_username')}</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={localize('com_ui_user_username_placeholder')}
                className="mt-1 w-full"
              />
            </div>
            <div>
              <Label className="text-text-primary">{localize('com_ui_user_role')}</Label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as SystemRoles)}
                disabled={isEditingSelf}
                className={cn(
                  'mt-1 w-full rounded-lg border border-border-light bg-transparent px-3 py-2',
                  'text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-heavy',
                )}
              >
                <option value={SystemRoles.USER}>{SystemRoles.USER}</option>
                <option value={SystemRoles.ADMIN}>{SystemRoles.ADMIN}</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="editEmailVerified"
                checked={emailVerified}
                onChange={(e) => setEmailVerified(e.target.checked)}
                className="rounded border-border-medium"
              />
              <Label htmlFor="editEmailVerified">{localize('com_ui_email_verified')}</Label>
            </div>
          </div>
        }
        buttons={
          <Button
            variant="submit"
            onClick={handleSubmit}
            disabled={isLoading || !email?.trim() || !email.includes('@')}
          >
            {isLoading ? <Spinner className="size-4" /> : localize('com_ui_save')}
          </Button>
        }
      />
    </OGDialog>
  );
}

export default React.memo(UserManagement);
