'use client';

/**
 * Sf100NotificationBell — surfaces SF100 in-app notifications on the team
 * dashboard. SF100 already GENERATES notifications (milestones, mentor feedback,
 * phase advances, stall warnings) into the shared notifications tables, but
 * nothing rendered them — so teams never saw them. This bell closes that gap.
 *
 * Data flow: everything runs through hooks/startup-studio/use-startup-studio-
 * notifications.ts, which reads/writes via StartupStudioNotificationService on
 * the authenticated RLS client (each user only sees their own rows).
 *   - useStartupStudioUnreadCount()               → live badge (60s poll)
 *   - useStartupStudioNotifications(20)           → recent list (read + unread)
 *   - useMarkStartupStudioNotificationRead()      → mark one (by user_notification_id)
 *   - useMarkAllStartupStudioNotificationsRead()  → mark all
 *
 * Interaction mirrors components/notifications/notification-bell.tsx (badge,
 * dropdown, outside-click close) but is SF100-specific and radix-free.
 */

import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Loader2, AlertCircle } from 'lucide-react';
import {
  useStartupStudioNotifications,
  useStartupStudioUnreadCount,
  useMarkStartupStudioNotificationRead,
  useMarkAllStartupStudioNotificationsRead,
} from '@/hooks/startup-studio/use-startup-studio-notifications';
import type { StartupStudioNotification } from '@/types/startup-studio';

/** Compact relative-time formatter — zero-dependency, avoids date-lib guessing. */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const s = Math.round((Date.now() - then) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.round(d / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(iso).toLocaleDateString();
}

export function Sf100NotificationBell() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const { data: unreadCount = 0 } = useStartupStudioUnreadCount();
  const {
    data: notifications = [],
    isLoading,
    isError,
  } = useStartupStudioNotifications(20);
  const markRead = useMarkStartupStudioNotificationRead();
  const markAllRead = useMarkAllStartupStudioNotificationsRead();

  // Close the dropdown on any outside click (no radix Dialog / Popover).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const handleNotificationClick = (n: StartupStudioNotification) => {
    if (n.is_read) return; // already read — nothing to do
    markRead.mutate(n.user_notification_id);
  };

  const handleMarkAll = () => {
    if (unreadCount === 0 || markAllRead.isPending) return;
    markAllRead.mutate();
  };

  const badge = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : 'Notifications'
        }
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-emerald-700" />
              <h3 className="text-sm font-semibold text-slate-900">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                disabled={markAllRead.isPending}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
              >
                {markAllRead.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="h-3.5 w-3.5" />
                )}
                Mark all read
              </button>
            )}
          </div>

          {/* Body */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : isError ? (
              <div className="flex items-start gap-2 px-4 py-6 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Couldn&apos;t load notifications. Please try again.</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">
                  No updates yet.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {notifications.map((n) => (
                  <li key={n.user_notification_id}>
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(n)}
                      className={`flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                        n.is_read ? '' : 'bg-emerald-50/40'
                      }`}
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          n.is_read ? 'bg-transparent' : 'bg-emerald-600'
                        }`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-sm ${
                            n.is_read
                              ? 'font-medium text-slate-700'
                              : 'font-semibold text-slate-900'
                          }`}
                        >
                          {n.title}
                        </span>
                        {n.message && (
                          <span className="mt-0.5 block text-xs leading-snug text-slate-500">
                            {n.message}
                          </span>
                        )}
                        <span className="mt-1 block text-[11px] text-slate-400">
                          {timeAgo(n.created_at)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
