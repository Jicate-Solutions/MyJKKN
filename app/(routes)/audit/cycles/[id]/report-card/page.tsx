'use client';

// app/(routes)/audit/cycles/[id]/report-card/page.tsx
// Gate ③ — the cycle REPORT CARD. Reads audit_parameter_results (written by
// fn_audit_capture_cycle_results) and shows, per parameter × institution:
//   • the verdict this cycle (pass / partial / fail),
//   • how many findings there were and how many are still open,
//   • whether this parameter keeps recurring across cycles, and
//   • how the gap CHANGED since the last cycle (delta + closures).
//
// This is the audit measuring itself: not "did we run the audit" but "is the
// institution actually getting better, parameter by parameter, cycle over
// cycle". A "Recompute" button re-scores the cycle idempotently via the
// capture RPC; results refresh through react-query invalidation.
//
// Rows read from useParameterResults(id) and the recompute mutation from
// useCaptureCycleResults() — both from '@/hooks/audit/use-audit-parameter-results'.

import { use, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { toast } from 'react-hot-toast';
import {
  ArrowLeft,
  RefreshCw,
  RotateCw,
  Inbox,
  ArrowUp,
  ArrowDown,
  Minus,
} from 'lucide-react';
import { useAuditCycle } from '@/hooks/audit/use-audit-cycles';
import {
  useParameterResults,
  useCaptureCycleResults,
} from '@/hooks/audit/use-audit-parameter-results';
import { CyclePhaseBadge } from '../../../_components/cycle-phase-badge';
import { SectionEyebrow, CoverageMeter } from '../../../_components/redesign/kit';
import { StandingReportCard } from '../../../_components/standing-report-card';
import { cn, getErrorMessage } from '@/lib/utils';
import type {
  AuditParameterResult,
  AuditParameterResultDelta,
  AuditParameterVerdict,
} from '@/lib/types/audit';

interface PageProps {
  params: Promise<{ id: string }>;
}

// The DB verdict domain includes 'unchecked' ("no findings AND not signed off")
// per the Gate ③ contract. The shared AuditParameterVerdict type may still lag
// that, so we widen it locally — this keeps the report card typechecking whether
// or not the shared union has caught up, without touching shared types.
type ReportVerdict = AuditParameterVerdict | 'unchecked';

// ---------------------------------------------------------------------------
// Verdict styling — mirrors the redesign kit's status pill language:
// pass = emerald (certified), partial = amber, fail = claret/red,
// unchecked = neutral slate ("Not checked yet" — un-scored, not a soft fail).
// ---------------------------------------------------------------------------
const VERDICT_META: Record<
  ReportVerdict,
  { label: string; className: string; dot: string }
> = {
  pass: {
    label: 'Pass',
    className:
      'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
    dot: 'bg-emerald-500',
  },
  partial: {
    label: 'Partial',
    className:
      'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
    dot: 'bg-amber-500',
  },
  fail: {
    label: 'Fail',
    className:
      'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200',
    dot: 'bg-red-500',
  },
  unchecked: {
    label: 'Not checked yet',
    className:
      'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    dot: 'bg-slate-400',
  },
};

// Fails first, then partials, then unchecked (un-scored), then passes. Within a
// verdict, the most-recurring (worst offenders) float up, then by code for a
// stable order.
const VERDICT_RANK: Record<ReportVerdict, number> = {
  fail: 0,
  partial: 1,
  unchecked: 2,
  pass: 3,
};

function VerdictPill({ verdict }: { verdict: ReportVerdict }) {
  const m = VERDICT_META[verdict];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium',
        m.className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', m.dot)} />
      {m.label}
    </span>
  );
}

function institutionLabel(institutionId: string | null): string {
  if (!institutionId) return 'All institutions';
  return institutionId.slice(0, 8);
}

// ---------------------------------------------------------------------------
// Delta cell — how the gap moved since the prior cycle. More findings than last
// time is WORSE (red, ↑); fewer is BETTER (green, ↓); unchanged is a muted dash.
// When there is no prior_result_id, this parameter × institution was never scored
// before — there is nothing to compare against, so we show a muted "New".
// ---------------------------------------------------------------------------
function DeltaCell({
  priorResultId,
  delta,
}: {
  priorResultId: string | null;
  delta: AuditParameterResultDelta | null;
}) {
  // No prior cycle for this pair → nothing to compare. (delta is also null here,
  // but prior_result_id is the source of truth for "first time scored".)
  if (!priorResultId || !delta) {
    return (
      <span
        className="text-xs text-muted-foreground"
        title="First time this parameter was scored — no prior cycle to compare against"
      >
        New
      </span>
    );
  }

  const change = delta.finding_count_change;
  return (
    <div className="flex flex-col gap-0.5">
      {change > 0 ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-300">
          <ArrowUp className="h-3 w-3" />
          {change} more
        </span>
      ) : change < 0 ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          <ArrowDown className="h-3 w-3" />
          {Math.abs(change)} fewer
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Minus className="h-3 w-3" />
          No change
        </span>
      )}
      {delta.closed_from_prior > 0 && (
        <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
          {delta.closed_from_prior} closed since last cycle
        </span>
      )}
    </div>
  );
}

export default function CycleReportCardPage({ params }: PageProps) {
  const { id } = use(params);

  const {
    data: cycle,
    isLoading: cycleLoading,
  } = useAuditCycle(id);

  const {
    data: results = [],
    isLoading: resultsLoading,
    error: resultsError,
    refetch,
  } = useParameterResults(id);

  const captureResults = useCaptureCycleResults();

  // Auto-recompute once on mount so the card is always fresh without pressing
  // Recompute. The useRef guard makes this fire a single time per mount (React
  // 18 StrictMode double-invokes effects in dev — the ref makes that a no-op),
  // and we skip if a capture is somehow already in flight. Success invalidates
  // the results query (wired in useCaptureCycleResults), which refetches. Silent
  // — no toast here; the manual Recompute button below owns the confirmation.
  const didAutoCapture = useRef(false);
  useEffect(() => {
    if (didAutoCapture.current) return;
    // Wait for the cycle so we can tell a standing cycle apart — a standing
    // "Whole Institution" audit is graded by discovery, not findings, so there
    // is nothing for the finding-based capture to compute.
    if (!id || !cycle || captureResults.isPending) return;
    didAutoCapture.current = true;
    if (cycle.is_standing) return;
    captureResults.mutate(id);
    // captureResults.mutate is stable; we intentionally run this once per cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, cycle]);

  // Fails first — the report card should lead with what still needs work.
  const sortedResults = useMemo<AuditParameterResult[]>(() => {
    return [...results].sort((a, b) => {
      const byVerdict =
        VERDICT_RANK[a.verdict as ReportVerdict] -
        VERDICT_RANK[b.verdict as ReportVerdict];
      if (byVerdict !== 0) return byVerdict;
      if (b.recurrence_count !== a.recurrence_count) {
        return b.recurrence_count - a.recurrence_count;
      }
      return a.parameter_code.localeCompare(b.parameter_code);
    });
  }, [results]);

  // Verdict tally → the shared coverage meter (emerald = pass, amber = partial,
  // red = fail), so the report card reads as one system with the rest of audit.
  const summary = useMemo(() => {
    let pass = 0;
    let partial = 0;
    let fail = 0;
    let unchecked = 0;
    for (const r of results) {
      const v = r.verdict as ReportVerdict;
      if (v === 'pass') pass++;
      else if (v === 'fail') fail++;
      else if (v === 'unchecked') unchecked++;
      else partial++;
    }
    // 'unchecked' is un-scored — it counts toward the total (denominator) but is
    // neither a pass nor a fail in the "X of N passed" math.
    return { pass, partial, fail, unchecked, total: results.length };
  }, [results]);

  async function handleRecompute() {
    try {
      await captureResults.mutateAsync(id);
      toast.success('Report card recomputed — the results below are up to date.');
    } catch (err) {
      toast.error(`Recompute failed: ${getErrorMessage(err)}`);
    }
  }

  const recomputing = captureResults.isPending;
  const loading = cycleLoading || resultsLoading;
  // Standing "Whole Institution" cycles are graded by discovery, not findings —
  // they get the discovery-status board instead of the finding-based report card.
  const isStanding = Boolean(cycle?.is_standing);

  return (
    <PermissionGuard module="audit" action="parameter.view">
      <ContentLayout
        title={cycle?.name ? `${cycle.name} — Report card` : 'Cycle report card'}
      >
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Audit', href: '/audit' },
            { label: 'Cycles', href: '/audit/cycles' },
            { label: cycle?.name ?? 'Cycle', href: `/audit/cycles/${id}` },
            { label: 'Report card', isCurrent: true },
          ]}
        />

        <div className="space-y-6">
          {/* Header — eyebrow + title + recompute */}
          <div className="flex flex-col gap-3">
            <Link
              href={`/audit/cycles/${id}`}
              className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to cycle
            </Link>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1">
                <SectionEyebrow>
                  Report card{cycle?.name ? ` · ${cycle.name}` : ''}
                </SectionEyebrow>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {isStanding ? 'Always-on checks' : 'How this cycle scored'}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                {cycle && <CyclePhaseBadge phase={cycle.phase} />}
                {!isStanding && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRecompute}
                    disabled={recomputing}
                  >
                    <RotateCw
                      className={cn('mr-2 h-4 w-4', recomputing && 'animate-spin')}
                    />
                    {recomputing ? 'Recomputing…' : 'Recompute'}
                  </Button>
                )}
              </div>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {isStanding
                ? 'The institution-wide checks that run continuously — graded by their own discovery, not by findings. This is the current status of each.'
                : 'Each parameter’s verdict this cycle, and how the gap changed since last cycle — closure, recurrence, and delta. This is how the audit measures itself.'}
            </p>
          </div>

          {/* Standing "Whole Institution" cycles: discovery-status board instead
              of the finding-based report card. */}
          {isStanding && <StandingReportCard cycleId={id} />}

          {/* Summary meter */}
          {!isStanding && !loading && !resultsError && summary.total > 0 && (
            <Card>
              <CardContent className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-[240px] space-y-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-semibold tabular-nums leading-none text-emerald-700 dark:text-emerald-300">
                        {summary.pass}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        of {summary.total} parameter
                        {summary.total === 1 ? '' : 's'} passed
                      </span>
                    </div>
                    <CoverageMeter
                      t={{
                        cleared: summary.pass,
                        p1: summary.fail,
                        p2: summary.partial,
                        observation: 0,
                        // 'unchecked' rides the meter's neutral track slot — it
                        // takes proportional width but renders as the grey rail,
                        // reading as "un-scored" rather than pass/partial/fail.
                        todo: summary.unchecked,
                      }}
                      className="max-w-sm"
                    />
                    <p className="text-[11.5px] text-muted-foreground">
                      {summary.pass} pass · {summary.partial} partial ·{' '}
                      {summary.fail} fail
                      {summary.unchecked > 0 && (
                        <> · {summary.unchecked} not checked</>
                      )}
                    </p>
                  </div>
                  <p className="max-w-[34ch] text-right text-xs text-muted-foreground">
                    A parameter passes only when its evidence held and no finding
                    stayed open. Recompute after closing findings to re-score the
                    cycle.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Results (finding-based; hidden for the standing board above) */}
          {!isStanding && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Parameter results
                {summary.total > 0 && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({summary.total} row{summary.total === 1 ? '' : 's'})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : resultsError ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                  <p className="text-sm text-destructive">
                    Failed to load report card
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(resultsError as Error)?.message ?? 'Unknown error'}
                  </p>
                  <Button size="sm" variant="outline" onClick={() => refetch()}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Retry
                  </Button>
                </div>
              ) : sortedResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                  <Inbox className="h-10 w-10 text-muted-foreground" />
                  <p className="max-w-sm text-sm text-muted-foreground">
                    No results captured yet — press Recompute to score this cycle.
                  </p>
                  <Button
                    size="sm"
                    onClick={handleRecompute}
                    disabled={recomputing}
                  >
                    <RotateCw
                      className={cn('mr-2 h-4 w-4', recomputing && 'animate-spin')}
                    />
                    {recomputing ? 'Recomputing…' : 'Recompute'}
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2.5 text-left font-semibold">
                          Parameter
                        </th>
                        <th className="px-4 py-2.5 text-left font-semibold">
                          Institution
                        </th>
                        <th className="px-4 py-2.5 text-left font-semibold">
                          Findings
                        </th>
                        <th className="px-4 py-2.5 text-left font-semibold">
                          Δ vs last cycle
                        </th>
                        <th className="px-4 py-2.5 text-right font-semibold">
                          Verdict
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedResults.map((r) => (
                        <tr
                          key={r.id}
                          className="border-b last:border-b-0 hover:bg-muted/20"
                        >
                          <td className="px-4 py-3 align-top">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                                {r.parameter_code}
                              </span>
                              {r.recurrence_count > 1 && (
                                <span
                                  title={`found in ${r.recurrence_count} consecutive cycles`}
                                  className="inline-flex items-center gap-0.5 rounded-full border border-red-300 bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
                                >
                                  ▲ ×{r.recurrence_count}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            {r.institution_id ? (
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {institutionLabel(r.institution_id)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                All institutions
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <span className="text-xs">
                              {r.finding_count} finding
                              {r.finding_count === 1 ? '' : 's'}
                              {r.finding_count > 0 && (
                                <span
                                  className={cn(
                                    r.open_finding_count > 0
                                      ? 'text-red-700 dark:text-red-300'
                                      : 'text-emerald-700 dark:text-emerald-300',
                                  )}
                                >
                                  {' · '}
                                  {r.open_finding_count > 0
                                    ? `${r.open_finding_count} open`
                                    : 'all closed'}
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <DeltaCell
                              priorResultId={r.prior_result_id}
                              delta={r.delta}
                            />
                          </td>
                          <td className="px-4 py-3 text-right align-top">
                            <VerdictPill verdict={r.verdict as ReportVerdict} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
