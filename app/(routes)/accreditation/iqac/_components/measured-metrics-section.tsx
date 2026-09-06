// app/(routes)/accreditation/iqac/_components/measured-metrics-section.tsx
// ============================================================================
// The CEO's July 2026 metric framework, measured.
//
// MOVED HERE FROM THE CLUSTER ACADEMIC COUNCIL PAGE, 2026-08-14, by Director
// decision. Nothing was deleted and no metric changed; only where it is read.
//
// WHY. The council is a cluster body — UGC prescribes it for a cluster of
// colleges, to develop new programmes, develop a research agenda, and review the
// progress of research. Apply the boundary test to this framework, one metric at
// a time: CAN ONE COLLEGE MOVE THIS NUMBER ALONE? All of them can. Not one
// measures an act that requires two colleges. That makes them measurements of an
// institution's own quality, which is what an IQAC exists to hold, and it is why
// the council's page had come to read as a repeat of the IQAC and NAAC surfaces
// sitting beside it.
//
// The audience did not narrow. The page this now lives on is gated on
// `accreditation.metrics.view` and the one it left was gated on
// `accreditation.cac.view`; the same eight roles hold both, reaching the same
// 153 people. Nobody who could read these metrics yesterday has lost them.
//
// A pointer with a link is left on the council's page, so a reader who knows
// this framework by where it used to be is told where it went rather than
// finding a gap.
//
// The section itself is unchanged below. Four Director decisions shape every
// choice here, and each is load-bearing rather than cosmetic:
//
//   1. Measurement, no grade. There is no total, no score, no coverage
//      percentage and no ordering of institutions against each other. Domain
//      percentages that the CEO framework itself names — pass percentage,
//      attendance — are shown, because those are measurements the colleges
//      already own. What is absent is any number this page would have invented.
//
//   2. All 48 metrics on screen; the ones with no number read "not captured
//      yet", never 0. A zero is a measured bad result and would libel a college
//      for a gap in the platform.
//
//   3. Every institution, with schools apart from colleges and the four
//      non-teaching entities in their own collapsed group.
//
//   4. Working slice. The metrics with real substrate are wired; the rest
//      show the structure and say what is missing. Seeing
//      the shape of the gap is the point — the CEO's framework had no
//      representation here at all until now.
//
// A metric with no substrate renders as ONE spanning row rather than fourteen
// identical "not captured yet" cells: the reason belongs to the metric, not to
// each institution, and repeating it fourteen times buries the rows that
// do carry numbers.
//
// The same spanning row carries three further states, all of them saying that a
// value is missing for a reason that is not about any institution: the request
// failed, the request succeeded and returned nothing at all, or this one wired
// metric stopped reporting while the rest kept going. They exist because the
// per-institution cell has exactly one way to say "no value" — "none recorded" —
// and this page's legend defines that as a fact about that institution. Every
// cause that is NOT about the institution has to be caught before the cells are
// reached, or a broken feed is published as a finding against every college.
// ============================================================================

'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { BarChart3, ChevronDown, ChevronRight, Clock, Info } from 'lucide-react';
import {
  CAC_METRIC_CATALOG,
  CAC_CATALOG_VERSION,
  measuredMetricIds,
  substrateReason,
  summariseCatalog,
  type CacMetric,
} from '@/app/(routes)/accreditation/cac/_lib/cac-metric-catalog';
import {
  groupInstitutions,
  type GroupableInstitution,
} from '@/app/(routes)/accreditation/cac/_lib/cac-institution-groups';
import {
  useCacMeasuredMetrics,
  useCacAttendanceRollupFreshness,
  classifyMeasuredRead,
  classifyRollupFreshness,
  indexMeasuredRows,
  metricsWithData,
  stoppedReportingMetrics,
  type CacReadOutcome,
  type CacRollupFreshness,
} from '@/hooks/accreditation/use-cac-metrics';

interface Props {
  institutions: GroupableInstitution[];
  institutionsLoading: boolean;
}

/** Compact column heading: the IQAC code where there is one, else a short name. */
function columnHeading(inst: GroupableInstitution): string {
  if (inst.iqac_code) return inst.iqac_code;
  return inst.name
    .replace(/^JKKN\s+/i, '')
    .replace(/\s+(School|College)$/i, '')
    .slice(0, 10);
}

export function MeasuredMetricsSection({
  institutions,
  institutionsLoading,
}: Props) {
  const { data: rows, isLoading, error } = useCacMeasuredMetrics();
  const {
    data: rollupComputedAt,
    isLoading: rollupLoading,
    error: rollupError,
  } = useCacAttendanceRollupFreshness();
  const [showOther, setShowOther] = useState(false);

  // Held back until the read resolves. Classifying an in-flight query would
  // print "never computed" for as long as the request took, which is the one
  // state a reader would act on.
  const rollupFreshness: CacRollupFreshness | null = rollupLoading
    ? null
    : classifyRollupFreshness(rollupComputedAt, Boolean(rollupError));

  const groups = useMemo(() => groupInstitutions(institutions), [institutions]);
  const index = useMemo(() => indexMeasuredRows(rows ?? []), [rows]);
  const live = useMemo(() => metricsWithData(rows ?? []), [rows]);
  const outcome = useMemo(
    () => classifyMeasuredRead(rows, Boolean(error)),
    [rows, error],
  );
  // Wired metrics that returned nothing anywhere. Derived here rather than in
  // each row so the whole-read verdict is applied once and every row agrees
  // with every other about what kind of failure this is.
  const stopped = useMemo(
    () => stoppedReportingMetrics(measuredMetricIds(), live, outcome),
    [live, outcome],
  );
  const catalog = summariseCatalog();

  // Column order follows the groups, with the non-teaching entities appended
  // only when asked for. Their absence is stated, never silent.
  const otherGroup = groups.find((g) => g.id === 'other');
  const visible = useMemo(
    () =>
      groups
        .filter((g) => (g.id === 'other' ? showOther : true))
        .flatMap((g) => g.institutions.map((inst) => ({ ...inst, group: g.id }))),
    [groups, showOther],
  );

  const loading = isLoading || institutionsLoading;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <BarChart3 className="h-5 w-5 text-amber-600" />
          What the council can measure
        </CardTitle>
        <div className="mt-2 space-y-3 text-sm text-muted-foreground">
          <p>
            These are the metrics the Cluster Academic Council was given, exactly
            as issued, with the numbers the platform can stand behind today
            beside them. Nothing here is scored. There is no total, no
            percentage of completion and no ordering of one institution against
            another — a council reads its own numbers, it does not rank its
            members.
          </p>
          <p>
            Where a number is missing the cell says so. It never shows a zero: a
            zero would claim the work was measured and came to nothing, when what
            is true is that the platform does not capture it yet.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant="outline">
              {catalog.categories} categories
            </Badge>
            <Badge variant="outline">{catalog.metrics} metrics</Badge>
            <Badge variant="secondary">
              {/* A read that failed — or succeeded and returned nothing — knows
                  nothing about how many metrics carry numbers. Printing
                  live.size in either case would render a confident
                  "0 carrying numbers today" off an empty index. */}
              {loading || outcome !== 'values' ? '—' : live.size} carrying
              numbers today
            </Badge>
            <Badge variant="outline" className="font-mono text-xs">
              framework {CAC_CATALOG_VERSION}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p className="font-medium">The measured numbers could not be read.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The metric structure below is still correct. Only the values are
              missing. {String((error as Error)?.message ?? '')}
            </p>
          </div>
        )}

        {!loading && outcome === 'nothing-returned' && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <p className="font-medium">
              The read succeeded and returned no measurements at all.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Every wired metric came back empty at the same moment, which points
              at the read rather than at the cluster. The structure below is
              still correct, and no row beneath says anything about any
              institution.
            </p>
          </div>
        )}

        {otherGroup && otherGroup.institutions.length > 0 && (
          <div className="flex items-start justify-between gap-4 rounded-md border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">
              {otherGroup.note}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => setShowOther((v) => !v)}
            >
              {showOther ? (
                <ChevronDown className="mr-1 h-3 w-3" />
              ) : (
                <ChevronRight className="mr-1 h-3 w-3" />
              )}
              {showOther ? 'Hide' : 'Show'} {otherGroup.institutions.length} other
              entities
            </Button>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <TooltipProvider delayDuration={200}>
            {CAC_METRIC_CATALOG.map((category) => (
              <section key={category.id} className="space-y-2">
                <div>
                  <h3 className="text-base font-semibold">
                    {category.number}. {category.title}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {category.objective}
                  </p>
                </div>

                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-max border-collapse text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left font-medium">
                          Metric
                        </th>
                        {visible.map((inst) => (
                          <th
                            key={inst.id}
                            className={`px-2 py-2 text-center text-xs font-medium ${
                              inst.group === 'schools'
                                ? 'bg-blue-50/60 dark:bg-blue-950/20'
                                : inst.group === 'other'
                                  ? 'bg-muted'
                                  : ''
                            }`}
                            title={inst.name}
                          >
                            {columnHeading(inst)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {category.metrics.map((metric) => (
                        <MetricRow
                          key={metric.id}
                          metric={metric}
                          institutions={visible}
                          index={index}
                          outcome={outcome}
                          stopped={stopped}
                          rollupFreshness={rollupFreshness}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </TooltipProvider>
        )}

        <div className="space-y-1 border-t pt-4 text-xs text-muted-foreground">
          <p className="font-medium">Reading the table</p>
          <p>
            A number means the platform measured it. &ldquo;None recorded&rdquo;
            means this metric is wired and this institution has nothing in it
            yet. &ldquo;Not captured yet&rdquo; means the platform itself does
            not hold this — the reason is on the row. &ldquo;Does not
            apply&rdquo; marks a metric that cannot belong to a school. A dash
            (&mdash;) means the metric is wired and this institution has nothing
            inside the window being counted, which is not the same as having
            nothing at all.
          </p>
          <p>
            &ldquo;This measurement has stopped reporting&rdquo; means the metric
            is wired and normally carries numbers, but this time nothing came
            back for any institution while other metrics did. Several of these
            depend on an overnight job, and a job that has failed looks exactly
            like this — which is why it is kept apart from &ldquo;none
            recorded&rdquo;. One is a fact about an institution; this one is a
            fact about the pipeline, and reading it as the first would put a
            broken job on the record as a finding against every college.
          </p>
          <p>
            &ldquo;Values could not be read&rdquo; and &ldquo;No measurements
            came back&rdquo; are the two states that are not about the data at
            all. The first is a request that failed. The second is a request that
            succeeded and carried nothing — not one feed down but the whole read
            empty, which is a single fault rather than a gap in every metric.
            Both are kept separate from every state above on purpose: a page that
            showed either as an empty result would be reporting a gap that may
            not exist.
          </p>
          <p>
            Attendance is the presence rate over the last 30 days, because the
            full-history figure needs a nightly snapshot before it can be read
            inside a page request. The note on that row says when the nightly
            snapshot last ran, and turns amber when it has never run or has not
            run in the last day. The 30-day rate itself is worked out on every
            read and is never stale.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

interface RowProps {
  metric: CacMetric;
  institutions: Array<GroupableInstitution & { group: string }>;
  index: ReturnType<typeof indexMeasuredRows>;
  /** How much of the read can be believed. Anything but `values` and no cell
   *  may claim anything about a value. */
  outcome: CacReadOutcome;
  /** Wired metrics that returned nothing for any institution. */
  stopped: Set<string>;
  /** Age of the nightly attendance rollup, or null while it is being read. */
  rollupFreshness: CacRollupFreshness | null;
}

/** Day, month, year and time — a bare date cannot show a job that ran twice. */
function formatComputedAt(at: Date): string {
  return at.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * When the all-history attendance figure was last worked out.
 *
 * The number in this row is the trailing-window rate, computed on every read,
 * so it is never stale. The all-history figure behind it is not: it comes from
 * cac_attendance_rollup, which a nightly job fills, and a nightly job that
 * stops looks from here exactly like one that is running. This says which.
 *
 * "Never computed" carries no date at all. A page that fell back to today's
 * date, or to a dash, would let a job that has never once run read as a job
 * that ran this morning — and the amber is there so the difference is visible
 * before anyone quotes the figure.
 */
function AttendanceFreshness({
  freshness,
}: {
  freshness: CacRollupFreshness | null;
}) {
  if (!freshness) return null;

  const amber =
    'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400';
  const quiet = 'border-border bg-muted/50 text-muted-foreground';

  let text: string;
  let tone: string;
  let explanation: string;

  switch (freshness.state) {
    case 'never':
      text = 'All-history figure: never computed';
      tone = amber;
      explanation =
        'The nightly rollup has not produced an all-history attendance figure yet, so there is no date to show. The rate in this row is the trailing window and is computed fresh on every read — it is the all-history figure, not this one, that is missing.';
      break;
    case 'unknown':
      text = 'All-history figure: age could not be read';
      tone = quiet;
      // Deliberately not amber. Amber here would claim the job is behind,
      // when what actually happened is that we failed to find out.
      explanation =
        'The rollup could not be read, so how old the all-history figure is cannot be stated. This says nothing about whether the nightly job ran.';
      break;
    case 'stale':
      text = `All-history figure: computed ${formatComputedAt(freshness.computedAt)}`;
      tone = amber;
      explanation =
        'The nightly rollup last ran more than 24 hours ago. It is scheduled daily, so a gap this long means it has missed at least one run and the all-history figure is behind.';
      break;
    case 'fresh':
      text = `All-history figure: computed ${formatComputedAt(freshness.computedAt)}`;
      tone = quiet;
      explanation =
        'The nightly rollup ran within the last 24 hours, which is its schedule.';
      break;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`mt-1 inline-flex w-fit cursor-help items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${tone}`}
        >
          <Clock className="h-2.5 w-2.5 shrink-0" />
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        {explanation}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * A row whose whole width is one explanatory cell rather than per-institution
 * values, used whenever the reason belongs to the metric instead of to each
 * institution.
 *
 * colSpan is floored at 1: `institutions` is empty whenever the viewer's RLS
 * lets no institution through, and `colSpan={0}` is invalid HTML that browsers
 * resolve by spanning to the end of the row group — quietly, and differently
 * per engine.
 */
function SpanningRow({
  label,
  columns,
  children,
}: {
  label: ReactNode;
  columns: number;
  children: ReactNode;
}) {
  return (
    <tr className="border-b last:border-0">
      <th
        scope="row"
        className="sticky left-0 z-10 bg-background px-3 py-2 text-left font-normal"
      >
        {label}
      </th>
      <td
        colSpan={Math.max(columns, 1)}
        className="px-3 py-2 text-xs text-muted-foreground"
      >
        {children}
      </td>
    </tr>
  );
}

function MetricRow({
  metric,
  institutions,
  index,
  outcome,
  stopped,
  rollupFreshness,
}: RowProps) {
  const label = (
    <div className="flex items-start gap-1">
      <div className="flex flex-col">
        {metric.parent && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {metric.parent}
          </span>
        )}
        <span>{metric.ceoLabel}</span>
        {metric.id === 'attendance' && (
          <AttendanceFreshness freshness={rollupFreshness} />
        )}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="mt-0.5 h-3 w-3 shrink-0 cursor-help text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          {metric.evidence}
        </TooltipContent>
      </Tooltip>
    </div>
  );

  // Not measured anywhere: one spanning cell carrying the reason. Fourteen
  // identical cells would say the same thing fourteen times and hide the rows
  // that do have numbers.
  if (metric.substrate !== 'measured') {
    return (
      <SpanningRow label={label} columns={institutions.length}>
        <span className="font-medium">Not captured yet</span>
        <span className="mx-1">·</span>
        {substrateReason(metric.substrate)}
      </SpanningRow>
    );
  }

  // Everything from here to the cells guards the same mistake in three
  // different disguises. A measured row that has no values MUST NOT fall through
  // to the per-institution cells below: with nothing in the index every one of
  // them takes the `!cell` branch and prints "none recorded", which this page's
  // own legend defines as "wired, and this institution has nothing in it yet".
  // That turns a fault in the reading into a finding about fourteen colleges.
  // "Could not read", "read and got nothing back", "this one feed died" and
  // "read, and this institution really is empty" are four different facts, and
  // keeping them apart is the whole job of this page.

  // 1. The request errored. Nothing is known about anything.
  if (outcome === 'read-failed') {
    return (
      <SpanningRow label={label} columns={institutions.length}>
        <span className="font-medium">Values could not be read</span>
        <span className="mx-1">·</span>
        This metric is wired — the figures are missing because the request
        failed, not because there is nothing to show.
      </SpanningRow>
    );
  }

  // 2. The request came back and carried no value for any metric anywhere. Said
  //    plainly and identically on every wired row, because it is one fault and
  //    not one per metric — the banner above the table names it once.
  if (outcome === 'nothing-returned') {
    return (
      <SpanningRow label={label} columns={institutions.length}>
        <span className="font-medium">No measurements came back</span>
        <span className="mx-1">·</span>
        The read returned nothing for any metric, so this row describes the read
        and not this metric.
      </SpanningRow>
    );
  }

  // 3. Other metrics returned values and this one did not. It has real substrate
  //    behind it, so an absence spanning every institution at once is a feed
  //    that has stopped — several of these depend on an overnight job — rather
  //    than a cluster that emptied.
  if (stopped.has(metric.id)) {
    return (
      <SpanningRow label={label} columns={institutions.length}>
        <span className="font-medium">
          This measurement has stopped reporting
        </span>
        <span className="mx-1">·</span>
        It is wired and normally carries numbers, so the figures here are missing
        rather than absent. Nothing on this row is a finding about any
        institution.
      </SpanningRow>
    );
  }

  return (
    <tr className="border-b last:border-0">
      <th
        scope="row"
        className="sticky left-0 z-10 bg-background px-3 py-2 text-left font-normal"
      >
        {label}
      </th>
      {institutions.map((inst) => {
        const isSchoolCol = inst.group === 'schools' || inst.group === 'other';
        if (metric.scope === 'college' && isSchoolCol) {
          return (
            <td
              key={inst.id}
              className="px-2 py-2 text-center text-[11px] text-muted-foreground/60"
            >
              does not apply
            </td>
          );
        }

        const cell = index[inst.id]?.[metric.id];
        if (!cell || (cell.value_numeric === null && !cell.value_label)) {
          return (
            <td
              key={inst.id}
              className="px-2 py-2 text-center text-[11px] text-muted-foreground"
            >
              none recorded
            </td>
          );
        }

        return (
          <td key={inst.id} className="px-2 py-2 text-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help font-medium tabular-nums">
                  {cell.value_numeric === null
                    ? '—'
                    : formatValue(metric.id, cell.value_numeric)}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                <p className="font-medium">{inst.name}</p>
                <p>{cell.value_label}</p>
              </TooltipContent>
            </Tooltip>
          </td>
        );
      })}
    </tr>
  );
}

/**
 * Percentages keep their sign so a rate is never mistaken for a count; counts
 * are grouped so six figures stay readable at a glance.
 */
function formatValue(metricId: string, value: number): string {
  const isRate = metricId === 'attendance' || metricId === 'pass-percentage';
  if (isRate) return `${value}%`;
  return value.toLocaleString('en-IN');
}
