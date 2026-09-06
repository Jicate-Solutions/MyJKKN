'use client';

/**
 * Parent Portal — authenticated mobile shell: home header (hamburger · logo ·
 * bell), the page body, the persistent bottom tab bar, and the More / Theme
 * drawers. Wraps every page under the (authed) segment.
 */
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Menu, Bell } from 'lucide-react';
import { ParentBottomNav } from './parent-bottom-nav';
import { ParentMoreDrawer } from './parent-more-drawer';
import { ThemeDialog } from './theme-dialog';
import { ParentInstallPrompt } from './install-prompt';
import { useParentSession } from '@/hooks/parent/use-parent-session';
import { useParentNotifications } from '@/hooks/parent/use-parent-features';

export function ParentShell({ children }: { children: ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const { activeChild } = useParentSession();
  const { data: notif } = useParentNotifications();
  const unread = notif?.unread ?? 0;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-white dark:bg-neutral-950">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-black/5 bg-white/90 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-neutral-900/90">
        <button
          type="button"
          aria-label="Menu"
          onClick={() => setMoreOpen(true)}
          className="grid h-9 w-9 place-items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-center px-2">
          {activeChild?.institutionLogoUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeChild.institutionLogoUrl}
                alt={activeChild.institutionName}
                className="h-7 w-auto object-contain"
              />
              <p className="max-w-full truncate text-[10px] leading-tight text-muted-foreground">
                {activeChild.institutionName}
              </p>
            </>
          ) : (
            <>
              <p className="text-base font-extrabold leading-tight tracking-tight text-[#0b6d41]">
                MyJKKN
              </p>
              <p className="max-w-full truncate text-[10px] leading-tight text-muted-foreground">
                {activeChild?.institutionName || 'Parent Portal'}
              </p>
            </>
          )}
        </div>
        <Link
          href="/parent/notifications"
          aria-label="Notifications"
          className="relative grid h-9 w-9 place-items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-neutral-900">
              {unread}
            </span>
          )}
        </Link>
      </header>

      <main className="flex-1 px-4 pb-24 pt-4">{children}</main>

      <ParentBottomNav onMore={() => setMoreOpen(true)} />
      <ParentMoreDrawer
        open={moreOpen}
        onOpenChange={setMoreOpen}
        onOpenTheme={() => setThemeOpen(true)}
      />
      <ThemeDialog open={themeOpen} onOpenChange={setThemeOpen} />
      <ParentInstallPrompt />
    </div>
  );
}
