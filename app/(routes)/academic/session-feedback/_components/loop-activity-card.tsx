'use client';

// LOOP ACTIVITY PANEL (#4) — a self-contained card that visualises the SCF
// self-improving loop's vital signs for a window: how much raw learner signal came
// in, how many AI suggestions the loop produced (improvement vs success), how many
// were measured + their average lift, and the most recent suggestions.
//
// Mountable with no props (defaults to last 30 days) or with a shared { from, to }.
// Fetches via useLoopActivity → fn_scf_loop_activity (aggregates + AI coaching text
// only, never per-student feedback content). On RPC error (non-authorized caller) it
// renders an EXPLICIT access-denied message — never a silent redirect (CLAUDE.md #27).

import { useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  MessageSquare,
  Radio,
  Sparkles,
  TrendingUp,
  Wrench,
  Flag,
} from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { format, subDays } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLoopActivity } from '@/hooks/use-loop-activity';
import type { LoopActivity, LoopActivityRecentSuggestion } from '@/types/loop-activity';

const BRAND_GREEN = '#0b6d41';

/** Color an outcome lift: green positive, red negative, muted zero/null. */
function liftColor(lift: number | null): string {
  if (lift == null) return 'text-muted-foreground';
  if (lift > 0) return 'text-green-600';
  if (lift < 0) return 'text-red-600';
  return 'text-muted-foreground';
}

/** A single labelled metric tile. */
function StatTile({
  icon,
  label,
  value,
  sub,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-3">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={`text-2xl font-semibold tabular-nums ${valueClass ?? ''}`}>
        {value}
      </span>
      {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
    </div>
  );
}

function KindBadge({ kind }: { kind: LoopActivityRecentSuggestion['kind'] }) {
  return kind === 'success' ? (
    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
      <Sparkles className="mr-1 h-3 w-3" aria-hidden />
      Success
    </Badge>
  ) : (
    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
      <Wrench className="mr-1 h-3 w-3" aria-hidden />
      Improvement
    </Badge>
  );
}

export function LoopActivityCard({
  from,
  to,
  institutionId,
}: {
  from?: string;
  to?: string;
  /** Narrow to one college. Omitted by the session-feedback admin lane, which
   *  has no college picker; supplied by the attendance dashboard's filter bar. */
  institutionId?: string | null;
}) {
  // Default range: last 30 days (inclusive of today) — matches the admin lane.
  const range = useMemo(() => {
    if (from && to) return { from, to };
    const today = new Date();
    return { from: format(subDays(today, 30), 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
  }, [from, to]);

  const { data, isLoading, isError, error } = useLoopActivity(
    range.from,
    range.to,
    institutionId,
  );
  const a = data as LoopActivity | null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" style={{ color: BRAND_GREEN }} />
          Loop Activity
        </CardTitle>
        <CardDescription>
          The self-improving loop&apos;s vital signs for this window — raw learner
          signal in, AI suggestions out, and whether they moved understanding. All
          figures are aggregates; individual learner feedback is never shown.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <BeatLoader color={BRAND_GREEN} />
            <p className="mt-4 text-sm text-muted-foreground">Loading loop activity…</p>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500" />
            <p className="max-w-md text-sm font-medium text-foreground">
              You don&apos;t have access to the loop activity panel — contact your
              administrator.
            </p>
            {error instanceof Error && error.message ? (
              <p className="max-w-md text-xs text-muted-foreground">{error.message}</p>
            ) : null}
          </div>
        ) : !a ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No loop activity data for this period.
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              Showing {a.window_from} to {a.window_to}
            </p>

            {/* Vital-signs grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatTile
                icon={<MessageSquare className="h-3.5 w-3.5" aria-hidden />}
                label="Feedback in"
                value={a.total_feedback}
                sub={`${a.async_feedback} async · ${a.live_poll_feedback} live`}
              />
              <StatTile
                icon={<Radio className="h-3.5 w-3.5" aria-hidden />}
                label="Live pulses"
                value={a.live_pulses}
              />
              <StatTile
                icon={<Flag className="h-3.5 w-3.5" aria-hidden />}
                label="Low-understanding flags"
                value={a.low_understanding_flags}
                valueClass={a.low_understanding_flags > 0 ? 'text-red-600' : ''}
              />
              <StatTile
                icon={<Sparkles className="h-3.5 w-3.5" aria-hidden />}
                label="AI suggestions"
                value={a.improvement_suggestions + a.success_suggestions}
                sub={`${a.improvement_suggestions} fix · ${a.success_suggestions} replicate`}
              />
              <StatTile
                icon={<TrendingUp className="h-3.5 w-3.5" aria-hidden />}
                label="Measured outcomes"
                value={a.measured_outcomes}
                sub={
                  a.avg_outcome_lift != null ? (
                    <span className={liftColor(a.avg_outcome_lift)}>
                      {a.avg_outcome_lift > 0 ? '+' : ''}
                      {a.avg_outcome_lift.toFixed(2)} avg lift
                    </span>
                  ) : (
                    'no lift measured yet'
                  )
                }
              />
            </div>

            {/* Recent suggestions */}
            <div className="mt-5">
              <h4 className="mb-2 text-sm font-medium text-foreground">
                Recent suggestions
              </h4>
              {a.recent_suggestions.length === 0 ? (
                <p className="rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                  {a.total_feedback === 0
                    ? 'No loop activity in this period yet.'
                    : 'No AI suggestions generated yet — the loop produces these from low-understanding windows (and standout successes) as more feedback accumulates.'}
                </p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {a.recent_suggestions.map((s) => (
                    <li key={s.id} className="flex flex-col gap-1.5 p-3 sm:flex-row sm:items-start sm:gap-3">
                      <div className="flex shrink-0 items-center gap-2">
                        <KindBadge kind={s.kind} />
                        <span className="font-mono text-xs text-muted-foreground">
                          {s.course_code ?? '—'}
                        </span>
                      </div>
                      <p className="flex-1 text-sm text-foreground">
                        {s.summary || (
                          <span className="italic text-muted-foreground">
                            (no summary)
                          </span>
                        )}
                      </p>
                      {s.outcome_lift != null ? (
                        <span
                          className={`shrink-0 text-xs font-semibold tabular-nums ${liftColor(s.outcome_lift)}`}
                          title="Measured understanding lift vs the window baseline"
                        >
                          {s.outcome_lift > 0 ? '+' : ''}
                          {s.outcome_lift.toFixed(2)} lift
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          not measured
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
