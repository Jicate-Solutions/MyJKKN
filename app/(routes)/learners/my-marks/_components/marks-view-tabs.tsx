'use client';

/**
 * Top-level tab switcher: Internal Marks | Result.
 *
 * Each tab has a distinct accent color so students can scan the page and
 * immediately identify what's where without reading labels — Internal
 * Marks is emerald (CIA / continuous), Result is amber (final / trophy).
 *
 * Switching navigates between routes (preserving the active semester via
 * a `?semester=` carry-over so the student doesn't lose context).
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ClipboardList, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  {
    href: '/learners/my-marks/internal',
    label: 'Internal Marks',
    helper: 'Round-wise CIA assessment marks',
    icon: ClipboardList,
    // Active palette: emerald (matches "in-progress / continuous" feel)
    activeBg: 'bg-emerald-600',
    activeText: 'text-white',
    activeRing: 'ring-emerald-500/30',
    iconBg: 'bg-emerald-100 text-emerald-700',
    iconBgActive: 'bg-emerald-500/30 text-white',
  },
  {
    href: '/learners/my-marks/result',
    label: 'Semester Result',
    helper: 'Published end-of-semester result',
    icon: Trophy,
    // Active palette: amber (matches "achievement / award" feel)
    activeBg: 'bg-amber-600',
    activeText: 'text-white',
    activeRing: 'ring-amber-500/30',
    iconBg: 'bg-amber-100 text-amber-700',
    iconBgActive: 'bg-amber-500/30 text-white',
  },
] as const;

export function MarksViewTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function go(href: string) {
    const semester = searchParams.get('semester');
    const params = new URLSearchParams();
    if (semester) params.set('semester', semester);
    const qs = params.toString();
    router.push(qs ? `${href}?${qs}` : href);
  }

  return (
    <div className="rounded-xl border bg-gradient-to-br from-muted/40 to-muted/20 p-1 grid grid-cols-2 gap-1 shadow-sm">
      {TABS.map((tab) => {
        const isActive = pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <button
            key={tab.href}
            type="button"
            onClick={() => !isActive && go(tab.href)}
            aria-pressed={isActive}
            className={cn(
              'group relative flex items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold transition-all',
              'min-h-[44px]',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
              isActive
                ? cn(tab.activeBg, tab.activeText, 'shadow-sm ring-1', tab.activeRing)
                : 'text-foreground/80 hover:bg-background hover:shadow-sm'
            )}
          >
            <span
              className={cn(
                'inline-flex items-center justify-center rounded-md p-1 transition-colors',
                isActive ? tab.iconBgActive : tab.iconBg
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="flex flex-col items-start leading-tight">
              <span className="text-[13px]">{tab.label}</span>
              <span
                className={cn(
                  'hidden sm:inline text-[10px] font-normal',
                  isActive ? 'text-white/80' : 'text-muted-foreground'
                )}
              >
                {tab.helper}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
