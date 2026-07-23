'use client';

// StandingReportCard — the report card for the standing "Whole Institution" audit.
// Org-wide params (LOOP_HEALTH, EXAM_IA_AUDIT) are graded by their DISCOVERY output,
// not by findings, so the finding-based capture never populates the standing cycle.
// This board runs each org-wide param's discovery over the (open-ended) cycle window
// and shows whether the always-on check is currently producing fresh evidence.
// Transparent by design: it reports "measured / no data", the row count, and a sample
// of the actual evidence — it does NOT invent a per-parameter pass/fail threshold.

import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  RotateCw,
  CheckCircle2,
  CircleDashed,
  AlertTriangle,
  Inbox,
} from 'lucide-react';
import { cn, getErrorMessage } from '@/lib/utils';
import { useStandingBoard } from '@/hooks/audit/use-audit-discovery';
import type {
  AuditStandingBoardRow,
  AuditStandingBoardStatus,
} from '@/lib/types/audit';

const STATUS_META: Record<
  AuditStandingBoardStatus,
  { label: string; pill: string; icon: React.ComponentType<{ className?: string }> }
> = {
  measured: {
    label: 'Measured',
    pill: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
    icon: CheckCircle2,
  },
  no_data: {
    label: 'No data yet',
    pill: 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    icon: CircleDashed,
  },
  error: {
    label: 'Check failed',
    pill: 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
    icon: AlertTriangle,
  },
};

// Framework badges from the parameter's framework_mapping, skipping empty/'-'.
function frameworkBadges(mapping: Record<string, string> | null): string[] {
  if (!mapping) return [];
  return Object.entries(mapping)
    .filter(([, v]) => v && v !== '-')
    .map(([k, v]) => `${k.toUpperCase()} ${v}`);
}

// Compact one-line preview of a single evidence row (first few fields).
function rowPreview(row: Record<string, unknown>): string {
  return Object.entries(row)
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join('  ·  ');
}

function BoardCard({ row }: { row: AuditStandingBoardRow }) {
  const meta = STATUS_META[row.status] ?? STATUS_META.error;
  const Icon = meta.icon;
  const badges = useMemo(() => frameworkBadges(row.framework_mapping), [row.framework_mapping]);
  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{row.parameter_code}</span>
              {badges.map((b) => (
                <span
                  key={b}
                  className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                >
                  {b}
                </span>
              ))}
            </div>
            <p className="text-sm font-semibold">{row.name}</p>
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
              meta.pill
            )}
          >
            <Icon className="h-3 w-3" /> {meta.label}
          </span>
        </div>

        <p className="text-[13px] text-muted-foreground">
          {row.status === 'measured' ? (
            <>
              <span className="font-medium text-foreground">{row.measured_count}</span>{' '}
              fresh {row.measured_count === 1 ? 'result' : 'results'} in the current window — the
              check is running and producing evidence.
            </>
          ) : row.status === 'no_data' ? (
            <>No evidence in the current window. The check is configured but has produced nothing to grade yet.</>
          ) : (
            <>This check could not run. {String((row.sample?.[0] as any)?.error ?? '')}</>
          )}
        </p>

        {row.status === 'measured' && row.sample.length > 0 && (
          <div className="space-y-1 rounded-md bg-muted/50 p-2">
            {row.sample.map((s, i) => (
              <p key={i} className="truncate font-mono text-[11px] text-muted-foreground">
                {rowPreview(s)}
              </p>
            ))}
            {row.measured_count > row.sample.length && (
              <p className="text-[11px] text-muted-foreground/70">
                +{row.measured_count - row.sample.length} more
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function StandingReportCard({ cycleId }: { cycleId: string }) {
  const { data, isLoading, isFetching, refetch, error } = useStandingBoard(cycleId);
  const rows = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          These institution-wide checks run continuously and are graded by their own
          discovery — not by findings. Here is each one&rsquo;s current status. &ldquo;Measured&rdquo;
          means the check is producing fresh evidence; &ldquo;No data yet&rdquo; means it ran but found
          nothing to grade in the current window.
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RotateCw className={cn('mr-2 h-4 w-4', isFetching && 'animate-spin')} />
          Re-run checks
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-red-600 dark:text-red-400">
            Could not load the checks: {getErrorMessage(error)}
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">No institution-wide checks configured</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Org-wide parameters (with a discovery query) will appear here once added.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <BoardCard key={row.parameter_code} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
