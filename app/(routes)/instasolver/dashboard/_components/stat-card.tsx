// Ported from the standalone InstaSolver (components/stat-card.tsx).
//
// A stat card binds to a value it is GIVEN — it cannot produce one. v1 of the
// standalone app rendered literal numbers here and leadership read them as
// real; with nothing to show, this renders a skeleton or an em dash, never a
// plausible-looking figure.

import Link from 'next/link';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { Tone } from '@/lib/instasolver/constants';

/** The icon wash: a soft tile with the icon in the tone's own colour. */
export const TONE_ICON: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  info: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  progress: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  danger: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
  muted: 'bg-muted text-muted-foreground'
};

/** The faint glow in the card's corner. */
const TONE_GLOW: Record<Tone, string> = {
  neutral: 'bg-slate-400',
  info: 'bg-sky-400',
  warning: 'bg-amber-400',
  progress: 'bg-indigo-400',
  success: 'bg-emerald-400',
  danger: 'bg-red-400',
  muted: 'bg-slate-300'
};

export interface StatCardProps {
  label: string;
  value: number | null | undefined;
  suffix?: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: Tone;
  href?: string;
  isLoading?: boolean;
}

export function StatCard({ label, value, suffix, hint, icon: Icon, tone = 'neutral', href, isLoading = false }: StatCardProps) {
  const body = (
    <CardContent className="relative flex flex-col items-start gap-2.5 p-3.5 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
      <span
        className={cn('pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-30 blur-2xl', TONE_GLOW[tone])}
        aria-hidden
      />
      {Icon ? (
        <span
          className={cn('relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', TONE_ICON[tone])}
          aria-hidden
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
      ) : null}
      <div className={cn('relative w-full min-w-0 flex-1', href ? 'sm:pr-5' : null)}>
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        {isLoading ? (
          <Skeleton className="mt-1 h-6 w-12" />
        ) : (
          <p className="text-xl font-semibold leading-tight tracking-tight tabular-nums">
            {typeof value === 'number' ? (
              <>
                {value.toLocaleString('en-IN')}
                {suffix ? <span className="ml-0.5 text-sm font-medium text-muted-foreground">{suffix}</span> : null}
              </>
            ) : (
              '—'
            )}
          </p>
        )}
        {hint ? <p className="line-clamp-2 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {href ? (
        <ArrowUpRight
          className="absolute right-3 top-3 h-4 w-4 text-muted-foreground transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
          aria-hidden
        />
      ) : null}
    </CardContent>
  );

  if (!href) return <Card className="overflow-hidden">{body}</Card>;
  return (
    <Card className="group overflow-hidden transition-all duration-200 focus-within:ring-2 focus-within:ring-ring hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <Link href={href} className="block rounded-xl outline-none">
        {body}
      </Link>
    </Card>
  );
}

export function StatCardGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{children}</div>;
}
