'use client';

/**
 * Parent Portal — persistent bottom tab bar (mobile-first).
 * Phase A1 ships Home + a "More" drawer; the data tabs (Attendance, Fees,
 * Notifications) are rendered as "coming soon" until their phases land, so the
 * shell never links to a dead route.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, CalendarCheck, Wallet, Bell, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Tab {
  key: string;
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
  onClick?: () => void;
}

export function ParentBottomNav({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();

  const tabs: Tab[] = [
    { key: 'home', label: 'Home', href: '/parent/dashboard', icon: Home, enabled: true },
    { key: 'attendance', label: 'Attendance', href: '/parent/attendance', icon: CalendarCheck, enabled: true },
    { key: 'fees', label: 'Fees', href: '/parent/fees', icon: Wallet, enabled: true },
    { key: 'notifications', label: 'Alerts', href: '/parent/notifications', icon: Bell, enabled: true },
    { key: 'more', label: 'More', icon: Menu, enabled: true, onClick: onMore },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/85 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.25)] backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/85">
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {tabs.map((tab) => {
          const active = tab.href ? pathname === tab.href : false;
          const Icon = tab.icon;
          const content = (
            <span
              className={cn(
                'flex flex-1 flex-col items-center gap-1 pb-2 pt-2 text-[10px] font-semibold transition-colors',
                active ? 'text-[#0b6d41]' : 'text-neutral-500 dark:text-neutral-400',
                !tab.enabled && 'opacity-50'
              )}
            >
              <span
                className={cn(
                  'grid h-9 w-9 place-items-center rounded-full transition-all duration-300 ease-out',
                  active
                    ? 'bg-[#0b6d41]/10 text-[#0b6d41] ring-1 ring-inset ring-[#0b6d41]/15 dark:bg-[#0b6d41]/25'
                    : 'text-neutral-500 dark:text-neutral-400'
                )}
              >
                <Icon className={cn('h-5 w-5 transition-transform duration-300', active && 'scale-110')} />
              </span>
              {tab.label}
            </span>
          );

          if (tab.href && tab.enabled) {
            return (
              <li key={tab.key} className="flex flex-1">
                <Link href={tab.href} className="flex flex-1 justify-center">
                  {content}
                </Link>
              </li>
            );
          }

          return (
            <li key={tab.key} className="flex flex-1">
              <button
                type="button"
                className="flex flex-1 justify-center"
                onClick={
                  tab.onClick ??
                  (() => toast.info(`${tab.label} is coming soon`))
                }
              >
                {content}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
