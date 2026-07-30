// app/(routes)/accreditation/cac/_components/measured-metrics-section.tsx
// ============================================================================
// The measured half of the Cluster Academic Council page.
//
// The page above it describes the council. This section describes what the
// council can actually see. Four Director decisions shape every choice here, and
// each is load-bearing rather than cosmetic:
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
//   4. Working slice. Eleven metrics have real substrate and are wired; the
//      remaining thirty-seven show the structure and say what is missing. Seeing
//      the shape of the gap is the point — the CEO's framework had no
//      representation here at all until now.
//
// A metric with no substrate renders as ONE spanning row rather than fourteen
// identical "not captured yet" cells: the reason belongs to the metric, not to
// each institution, and repeating it fourteen times buries the eleven rows that
// do carry numbers.
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
import { BarChart3, ChevronDown, ChevronRight, Info } from 'lucide-react';
import {
  CAC_METRIC_CATALOG,
  CAC_CATALOG_VERSION,
  substrateReason,
  summariseCatalog,
  type CacMetric,
} from '../_lib/cac-metric-catalog';
import {
  groupInstitutions,
  type GroupableInstitution,
} from '../_lib/cac-institution-groups';
import {
  useCacMeasuredMetrics,
  indexMeasuredRows,
  metricsWithData,
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
  const [showOther, setShowOther] = useState(false);

  const groups = useMemo(() => groupInstitutions(institutions), [institutions]);
  const index = useMemo(() => indexMeasuredRows(rows ?? []), [rows]);
  const live = useMemo(() => metricsWithData(rows ?? []), [rows]);
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
              {/* A failed read knows nothing about how many metrics carry
                  numbers. Printing live.size here would render a confident
                  "0 carrying numbers today" off an empty index. */}
              {loading || error ? '—' : live.size} carrying numbers today
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
                          readFailed={Boolean(error)}
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
            &ldquo;Values could not be read&rdquo; is the one state that is not
            about the data: the request for the numbers failed. It is kept
            separate from every state above on purpose — a page that showed a
            read failure as an empty result would be reporting a gap that may
            not exist.
          </p>
          <p>
            Attendance is the presence rate over the last 30 days, because the
            full-history figure needs a nightly snapshot before it can be read
            inside a page request.
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
  /** The RPC failed. No cell may claim anything about a value. */
  readFailed: boolean;
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

function MetricRow({ metric, institutions, index, readFailed }: RowProps) {
  const label = (
    <div className="flex items-start gap-1">
      <div>
        {metric.parent && (
          <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
            {metric.parent}
          </span>
        )}
        <span>{metric.ceoLabel}</span>
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

  // The read failed, so this row has no values to show — and MUST NOT fall
  // through to the per-institution cells below. With an empty index every one
  // of them takes the `!cell` branch and prints "none recorded", which this
  // page's own legend defines as "wired, and this institution has nothing in it
  // yet". That would manufacture a measured-empty claim for every institution
  // on every measured metric out of a request that simply did not come back.
  // "Could not read" and "read, and there is nothing" are the two states this
  // whole page exists to keep apart.
  if (readFailed) {
    return (
      <SpanningRow label={label} columns={institutions.length}>
        <span className="font-medium">Values could not be read</span>
        <span className="mx-1">·</span>
        This metric is wired — the figures are missing because the request
        failed, not because there is nothing to show.
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
