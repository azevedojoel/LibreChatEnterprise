import { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Select from '@ariakit/react/select';
import { Bell } from 'lucide-react';
import { Button, useToastContext } from '@librechat/client';
import {
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} from 'librechat-data-provider/react-query';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import type { TNotification } from 'librechat-data-provider';

function formatTime(createdAt?: string) {
  if (!createdAt) return '';
  const d = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

export default function NotificationBell() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthContext();
  const { showToast } = useToastContext();
  const prevUnreadCountRef = useRef<number>(0);
  const hasFetchedBeforeRef = useRef(false);

  const { data, isSuccess } = useGetNotificationsQuery(
    { limit: 25, unreadOnly: false },
    { enabled: isAuthenticated },
  );
  const markReadMutation = useMarkNotificationReadMutation();
  const markAllReadMutation = useMarkAllNotificationsReadMutation();

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  // Toast for new notifications when poll detects new unread (Option A from plan)
  useEffect(() => {
    if (!isSuccess || data == null) return;
    const unreadCount = data.unreadCount ?? 0;
    if (!hasFetchedBeforeRef.current) {
      hasFetchedBeforeRef.current = true;
      prevUnreadCountRef.current = unreadCount;
      return;
    }
    if (unreadCount > prevUnreadCountRef.current) {
      const latestUnread = data.notifications?.find((n) => !n.readAt);
      if (latestUnread) {
        showToast({ message: latestUnread.title, severity: 'info' });
      }
    }
    prevUnreadCountRef.current = unreadCount;
  }, [isSuccess, data, showToast]);

  const handleNotificationClick = (n: TNotification) => {
    if (n.link) {
      navigate(n.link);
    }
    if (!n.readAt) {
      markReadMutation.mutate(n._id);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <Select.SelectProvider>
      <Select.Select
        aria-label={localize('com_nav_notifications')}
        className="flex items-center justify-center rounded-full border-none bg-transparent p-0 hover:bg-surface-active-alt focus-visible:ring-inset focus-visible:ring-black focus-visible:ring-offset-0 dark:focus-visible:ring-white md:rounded-xl"
      >
        <Button
          size="icon"
          variant="outline"
          data-testid="nav-notifications-button"
          aria-label={localize('com_nav_notifications')}
          className="relative rounded-full border-none bg-transparent duration-0 hover:bg-surface-active-alt focus-visible:ring-inset focus-visible:ring-black focus-visible:ring-offset-0 dark:focus-visible:ring-white md:rounded-xl"
        >
          <Bell className="icon-lg text-text-primary" />
          {unreadCount > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white"
              aria-hidden
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </Select.Select>
      <Select.SelectPopover
        className="popover-ui z-[125] flex max-h-[min(400px,70vh)] w-[244px] flex-col overflow-hidden rounded-lg bg-surface-primary"
        style={{ transformOrigin: 'top', translate: '0 4px' }}
      >
        <div className="flex items-center justify-between border-b border-border-medium px-3 py-2">
          <span className="text-sm font-medium text-text-primary">
            {localize('com_nav_notifications')}
          </span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllReadMutation.mutate()}
              className="text-xs text-text-secondary hover:text-text-primary"
            >
              {localize('com_nav_mark_all_read')}
            </button>
          )}
        </div>
        <div className="flex min-h-[120px] max-h-[min(350px,60vh)] flex-1 flex-col overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10">
              <Bell className="size-10 text-text-secondary" aria-hidden />
              <p className="text-center text-sm font-medium text-text-primary">
                {localize('com_nav_no_notifications')}
              </p>
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n._id}
                type="button"
                onClick={() => handleNotificationClick(n)}
                className={cn(
                  'flex w-full flex-col gap-0.5 border-b border-border-light px-3 py-2.5 text-left transition-colors hover:bg-surface-active-alt',
                  !n.readAt && 'bg-surface-active-alt/50',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-text-primary">{n.title}</span>
                  <span className="text-xs text-text-secondary">{formatTime(n.createdAt)}</span>
                </div>
                {n.body && (
                  <p className="line-clamp-2 text-xs text-text-secondary">{n.body}</p>
                )}
              </button>
            ))
          )}
        </div>
      </Select.SelectPopover>
    </Select.SelectProvider>
  );
}
