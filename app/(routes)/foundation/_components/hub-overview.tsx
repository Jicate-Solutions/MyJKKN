'use client';

// Foundation — hub overview. Orients the user and routes into the console. A
// tabular-nums KPI strip summarises the programme at a glance, then a primary
// console CTA and a quick grid of active cohorts.

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, GraduationCap, LayoutGrid, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useCohorts } from '@/hooks/foundation/use-foundation';

export function HubOverview() {
  const { data: cohorts, isLoading } = useCohorts();

  const stats = useMemo(() => {
    const list = cohorts ?? [];
    const students = list.reduce((sum, c) => sum + (c.enrolled_count ?? 0), 0);
    const exams = new Set(list.map((c) => c.exam_definition_id)).size;
    return { cohorts: list.length, students, exams };
  }, [cohorts]);

  return (
    <div className="space-y-8">
      {/* KPI strip */}
      <div className="grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-card">
        <Stat label="Active cohorts" value={isLoading ? null : stats.cohorts} />
        <Stat label="Students enrolled" value={isLoading ? null : stats.students} />
        <Stat label="Exams covered" value={isLoading ? null : stats.exams} />
      </div>

      {/* Primary CTA */}
      <Link
        href="/foundation/console"
        className="group flex items-center justify-between gap-4 rounded-xl border border-[#0b6d41]/25 bg-[#0b6d41]/[0.04] p-5 transition-colors hover:bg-[#0b6d41]/[0.07]"
      >
        <div className="flex items-center gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#0b6d41] text-white">
            <LayoutGrid className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Faculty console
            </p>
            <p className="text-sm text-muted-foreground">
              Manage cohorts, author questions, build diagnostics and mocks.
            </p>
          </div>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-[#0b6d41] transition-transform group-hover:translate-x-0.5" />
      </Link>

      {/* Active cohorts */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Your cohorts
        </h2>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : !cohorts || cohorts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center">
            <GraduationCap className="mx-auto h-7 w-7 text-muted-foreground/60" />
            <p className="mt-2 text-sm text-muted-foreground">
              No active cohorts assigned to you yet.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cohorts.map((c) => (
              <Link
                key={c.id}
                href="/foundation/console"
                className="rounded-xl border border-border p-4 transition-all hover:border-[#0b6d41]/40 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold leading-tight text-foreground">
                    {c.exam_definition?.display_name ?? 'Exam'}
                  </span>
                  {c.exam_definition?.level && (
                    <Badge
                      variant="outline"
                      className="shrink-0 text-[10px] capitalize"
                    >
                      {c.exam_definition.level}
                    </Badge>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  {c.term && <span>{c.term}</span>}
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    <span className="font-mono tabular-nums">
                      {c.enrolled_count ?? 0}
                    </span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="px-5 py-4">
      {value === null ? (
        <Skeleton className="h-8 w-12" />
      ) : (
        <div className="font-mono text-3xl font-semibold tabular-nums text-foreground">
          {value}
        </div>
      )}
      <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
