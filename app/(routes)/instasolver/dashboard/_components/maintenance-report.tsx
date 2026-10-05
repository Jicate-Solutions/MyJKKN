'use client';

// "Your work by status" — ported from the standalone InstaSolver
// (maintenance-report.tsx): the issues with your name or your team on them,
// counted by the statuses maintenance work passes through. Each card opens the
// matching My work tab. Counts come from the database, never the browser.

import Link from 'next/link';
import { ArrowRight, CheckCircle2, Loader2, UserCheck, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useWorkStatusCounts } from '@/hooks/instasolver/use-instasolver';
import { ISSUE_STATUS_META, type Tone } from '@/lib/instasolver/constants';
import { TONE_ICON } from './stat-card';

const KEYS: { status: 'assigned' | 'in_progress' | 'completed'; icon: LucideIcon; tab: string }[] = [
  { status: 'assigned', icon: UserCheck, tab: 'assigned' },
  { status: 'in_progress', icon: Loader2, tab: 'in_progress' },
  { status: 'completed', icon: CheckCircle2, tab: 'completed' }
];

export function MaintenanceReport() {
  const { data, isLoading } = useWorkStatusCounts();
  const total = data ? data.assigned + data.in_progress + data.completed : undefined;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Your work by status</h2>
          <p className="text-sm text-muted-foreground">Issues assigned to you or your teams, by status.</p>
        </div>
        <Link
          href="/instasolver/work"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
        >
          View all{typeof total === 'number' ? ` (${total})` : ''}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {KEYS.map(({ status, icon: Icon, tab }) => {
          const meta = ISSUE_STATUS_META[status];
          const count = data?.[status];
          return (
            <Link
              key={status}
              href={`/instasolver/work?tab=${tab}`}
              aria-label={`View ${count ?? ''} ${meta.label.toLowerCase()} issues`}
              className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="h-full transition-colors hover:bg-muted/40">
                <CardContent className="flex items-center gap-3 p-3">
                  <span
                    className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', TONE_ICON[meta.tone as Tone])}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <span className="block truncate text-xs font-medium text-muted-foreground">{meta.label}</span>
                    {isLoading ? (
                      <Skeleton className="mt-0.5 h-6 w-8" />
                    ) : (
                      <span className="text-lg font-bold leading-tight tabular-nums">{count ?? '—'}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
