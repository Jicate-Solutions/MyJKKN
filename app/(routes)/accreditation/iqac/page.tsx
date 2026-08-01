// app/(routes)/accreditation/iqac/page.tsx
// ============================================================================
// IQAC — the Internal Quality Assurance Cell's own dashboard.
//
// Until now the IQAC had no route in this codebase at all. Its work was visible
// only in slices: the NAAC tab showed NAAC's metrics, the NIRF tab showed NIRF's,
// and so on for ten bodies. Nobody could open one screen and see the framework
// the cell is actually accountable for.
//
// Director's locked decision, 2026-08-01: the 107 rows in
// `public.sh_accreditation_metrics` ARE the master accreditation framework. This
// page reads them as one governing list — grouped by awarding body, then by
// normalised category — and states, per metric, whether the platform can answer
// it today or cannot yet.
//
// ----------------------------------------------------------------------------
// THREE THINGS THIS PAGE DELIBERATELY DOES NOT DO
// ----------------------------------------------------------------------------
//  1. No overall grade, score or percentage-of-maximum. The CAC dashboard made
//     the same call for the same reason: a single number on an accreditation
//     screen reads as a rating, and no outside body has awarded JKKN anything
//     here. What is shown instead is a count of metrics answerable against a
//     count not yet answerable — a workload, not a verdict.
//  2. No guessed correspondence between the CEO's 48 CAC dimensions and these
//     107. That mapping lives in a config row (see the mapping panel below) and
//     is shown as unmapped where nobody has established it. Inventing one would
//     make an unanswered question look answered.
//  3. No edit. Adding or amending a framework metric already has a home at
//     /accreditation/manage/metrics; this page links there rather than growing a
//     second, competing editor.
// ============================================================================

'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ShieldCheck,
  Landmark,
  Settings,
  AlertTriangle,
  Link2Off,
  Network,
  ListChecks,
} from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useFrameworkMetrics,
  useFrameworkEvidenceCounts,
  useIqacMetricMap,
} from '@/hooks/accreditation/use-iqac-framework';
import {
  groupFramework,
  summariseCoverage,
  measurementState,
  evidenceKey,
  type CategoryVariant,
} from './_lib/metric-framework';
import {
  indexMappings,
  summariseMappings,
} from '@/lib/services/accreditation/iqac-metric-map-service';
import { allMetrics } from '../cac/_lib/cac-metric-catalog';

/**
 * The gate. `accreditation.metrics.view` already exists in
 * lib/constants/permissions.ts as "View Accreditation Metrics Catalog", which is
 * exactly what this page is a view of. No new key was invented — a key absent
 * from that file is ungrantable and never appears as a toggle in the role dialog.
 */
const VIEW_PERMISSION = 'accreditation.metrics.view';

const MANAGE_METRICS = '/accreditation/manage/metrics';

export default function IqacDashboardPage() {
  const { isSuperAdmin, can, isLoading: permsLoading } = usePermissions();
  const canView = isSuperAdmin || can(VIEW_PERMISSION);

  const { data: metrics, isLoading: metricsLoading, error: metricsError } =
    useFrameworkMetrics();
  const { data: evidenceCounts, isLoading: evidenceLoading } =
    useFrameworkEvidenceCounts();
  const { data: mapReadout, isLoading: mapLoading } = useIqacMetricMap();

  const rows = useMemo(() => metrics ?? [], [metrics]);
  const grouping = useMemo(() => groupFramework(rows), [rows]);
  const coverage = useMemo(
    () => summariseCoverage(rows, evidenceCounts ?? {}),
    [rows, evidenceCounts],
  );

  const cacDimensionIds = useMemo(() => allMetrics().map((m) => m.id), []);
  const mappingSummary = useMemo(
    () => summariseMappings(cacDimensionIds, indexMappings(mapReadout?.rows ?? [])),
    [cacDimensionIds, mapReadout],
  );

  const weightedCount = rows.filter((r) => r.weightage !== null).length;
  const isLoading = metricsLoading || evidenceLoading;

  if (permsLoading) {
    return (
      <ContentLayout title="IQAC">
        <Skeleton className="h-40 w-full" />
      </ContentLayout>
    );
  }

  // Say why, rather than bouncing to a landing page with no explanation.
  if (!canView) {
    return (
      <ContentLayout title="IQAC">
        <Card>
          <CardContent className="space-y-2 py-10 text-center text-sm text-muted-foreground">
            <p>You do not have permission to view the IQAC framework.</p>
            <p className="text-xs">
              Ask your IQAC coordinator for the
              <code className="mx-1">{VIEW_PERMISSION}</code>
              permission.
            </p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="IQAC — Internal Quality Assurance Cell">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'IQAC', href: '/accreditation/iqac' },
        ]}
      />

      <div className="space-y-6">
        <Card className="border-2 border-sky-300 bg-sky-50/40 dark:bg-sky-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <ShieldCheck className="h-7 w-7 text-sky-600" />
              IQAC — Internal Quality Assurance Cell
            </CardTitle>
            <div className="mt-3 space-y-3 text-sm text-muted-foreground">
              <p>
                One governing framework, read as a whole. The tabs beside this one
                each show a single awarding body&apos;s slice of it; this page
                shows every metric the cell is accountable for, from all ten
                bodies at once, and says which of them the platform can answer
                today.
              </p>
              <p>
                There is no grade here and nothing on this page is submitted
                anywhere. A metric is either answerable from records the platform
                already holds, or it is not captured yet — and the second is a
                statement about what has been built, not about how JKKN performs.
              </p>
            </div>
          </CardHeader>

          <CardContent>
            <div className="grid gap-3 md:grid-cols-4">
              <StatTile
                label="Metrics in the framework"
                value={isLoading ? '—' : String(grouping.total)}
              />
              <StatTile
                label="Awarding bodies"
                value={isLoading ? '—' : String(grouping.bodies.length)}
              />
              <StatTile
                label="Answerable today"
                value={isLoading ? '—' : String(coverage.measured)}
                sub={isLoading ? undefined : `of ${coverage.total}`}
              />
              <StatTile
                label="Not captured yet"
                value={isLoading ? '—' : String(coverage.notCapturedYet)}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={MANAGE_METRICS}>
                <Button variant="outline" size="sm">
                  <Settings className="mr-2 h-4 w-4" />
                  Manage the metric catalog
                </Button>
              </Link>
              <Link href="/accreditation/coverage">
                <Button variant="outline" size="sm">
                  <ListChecks className="mr-2 h-4 w-4" />
                  Cross-body coverage
                </Button>
              </Link>
              <Link href="/accreditation">
                <Button variant="outline" size="sm">
                  <Landmark className="mr-2 h-4 w-4" />
                  Accreditation hub
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {metricsError ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              The framework could not be read. Nothing has been changed — try
              again, and if it persists tell the platform team what this page
              showed.
            </CardContent>
          </Card>
        ) : null}

        {/* Accounting. Rendered rather than merely asserted in a test, so a
            future change that drops rows announces itself on the screen the
            IQAC actually opens. */}
        {!isLoading && rows.length > 0 && !grouping.isComplete && (
          <Card className="border-2 border-red-400 bg-red-50/50 dark:bg-red-950/20">
            <CardContent className="flex items-start gap-2 py-4 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <span>
                {grouping.total} metrics were read but only {grouping.accountedFor}{' '}
                appear in the sections below. Do not use this page until that is
                explained — some metrics are being hidden.
              </span>
            </CardContent>
          </Card>
        )}

        <NoWeightsNotice loading={isLoading} weighted={weightedCount} total={rows.length} />

        <CategoryVariantNotice conflicts={grouping.conflicts} loading={isLoading} />

        <MappingPanel
          loading={mapLoading}
          registryAvailable={mapReadout?.registryAvailable ?? false}
          summary={mappingSummary}
        />

        {isLoading ? (
          <Card>
            <CardContent className="space-y-3 pt-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {grouping.bodies.map((body) => (
              <Card key={body.body}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                    {body.body}
                    <Badge variant="secondary" className="text-[11px]">
                      {body.metricCount} metric{body.metricCount === 1 ? '' : 's'}
                    </Badge>
                    <Badge variant="outline" className="text-[11px]">
                      {body.categories.length} section
                      {body.categories.length === 1 ? '' : 's'}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Accordion type="multiple" className="w-full">
                    {body.categories.map((category) => {
                      const measured = category.metrics.filter(
                        (m) =>
                          measurementState(
                            (evidenceCounts ?? {})[
                              evidenceKey(m.metric_type, m.metric_code)
                            ],
                          ) === 'measured',
                      ).length;

                      return (
                        <AccordionItem
                          key={category.key}
                          value={`${body.body}-${category.key}`}
                        >
                          <AccordionTrigger className="text-left text-sm">
                            <span className="flex flex-1 flex-wrap items-center gap-2 pr-2">
                              <span className="font-medium">{category.label}</span>
                              <Badge variant="secondary" className="text-[10px]">
                                {category.metrics.length}
                              </Badge>
                              <span className="text-xs font-normal text-muted-foreground">
                                {measured} answerable
                              </span>
                              {category.hasVariantConflict && (
                                <Badge
                                  variant="outline"
                                  className="border-amber-400 text-[10px] text-amber-700 dark:text-amber-400"
                                >
                                  {category.variants.length} spellings merged
                                </Badge>
                              )}
                            </span>
                          </AccordionTrigger>
                          <AccordionContent>
                            {category.hasVariantConflict && (
                              <VariantList variants={category.variants} />
                            )}
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-[110px]">Code</TableHead>
                                    <TableHead>Metric</TableHead>
                                    <TableHead className="w-[90px] text-right">
                                      Max score
                                    </TableHead>
                                    <TableHead className="w-[90px] text-right">
                                      Weight
                                    </TableHead>
                                    <TableHead className="w-[150px]">Status</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {category.metrics.map((metric) => {
                                    const state = measurementState(
                                      (evidenceCounts ?? {})[
                                        evidenceKey(
                                          metric.metric_type,
                                          metric.metric_code,
                                        )
                                      ],
                                    );
                                    return (
                                      <TableRow key={`${metric.metric_type}-${metric.metric_code}`}>
                                        <TableCell className="font-mono text-xs">
                                          {metric.metric_code}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                          {metric.metric_name}
                                        </TableCell>
                                        <TableCell className="text-right text-sm">
                                          {metric.max_score ?? '—'}
                                        </TableCell>
                                        <TableCell className="text-right text-sm text-muted-foreground">
                                          {metric.weightage ?? 'not set'}
                                        </TableCell>
                                        <TableCell>
                                          {state === 'measured' ? (
                                            <Badge className="bg-emerald-600 text-[10px] hover:bg-emerald-600">
                                              Answerable
                                            </Badge>
                                          ) : (
                                            <Badge
                                              variant="outline"
                                              className="text-[10px] text-muted-foreground"
                                            >
                                              Not captured yet
                                            </Badge>
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card className="bg-muted/30">
          <CardContent className="space-y-2 pt-6 text-xs text-muted-foreground">
            <p>
              <strong>Where these metrics live.</strong> One row each in{' '}
              <code>sh_accreditation_metrics</code>. The awarding body is held in
              the <code>metric_type</code> column — there is no column called
              <code className="mx-1">accreditation_body</code>, which is a common
              wrong guess when writing a query against this table.
            </p>
            <p>
              <strong>What &ldquo;answerable&rdquo; counts.</strong> At least one
              record filed against that metric in{' '}
              <code>quality_evidence_mappings</code>. It says the platform can
              produce something for the metric, not that the evidence is
              sufficient, current or approved — that judgement stays with the
              cell.
            </p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">
        {value}
        {sub && (
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * The weightage column is NULL on all 107 rows in production. Reported rather
 * than hidden: a coordinator asked to "weight the framework" needs to know the
 * weights do not exist, and a column quietly dropped from the table would let
 * them assume weighting was already happening somewhere.
 */
function NoWeightsNotice({
  loading,
  weighted,
  total,
}: {
  loading: boolean;
  weighted: number;
  total: number;
}) {
  if (loading || total === 0 || weighted > 0) return null;
  return (
    <Card className="border-dashed">
      <CardContent className="flex items-start gap-2 py-4 text-sm text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span>
          No metric in the framework carries a weight — the weight column is empty
          on all {total}. The column is shown so this is visible rather than
          inferred. Nothing on this page weights, totals or ranks anything, so an
          empty weight changes no number here; it does mean any future scoring
          would have to set them first.
        </span>
      </CardContent>
    </Card>
  );
}

/**
 * The category-spelling panel — the reason this page groups on a normalised key.
 *
 * Merging the variants fixes the reading; it does not fix the data. Naming the
 * exact strings and their row counts is what lets a data owner reconcile them at
 * /accreditation/manage/metrics, after which this panel disappears on its own.
 */
function CategoryVariantNotice({
  conflicts,
  loading,
}: {
  conflicts: { body: string; label: string; variants: CategoryVariant[] }[];
  loading: boolean;
}) {
  if (loading || conflicts.length === 0) return null;

  return (
    <Card className="border-2 border-amber-300 bg-amber-50/40 dark:bg-amber-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          {conflicts.length} section{conflicts.length === 1 ? ' is' : 's are'}{' '}
          spelled more than one way in the data
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          These are one section each, and are shown as one above. Grouping on the
          raw text instead would split each into two headings that each look
          complete and each show only part of the metric list. The database still
          holds both spellings — reconciling them is a catalog edit, not a code
          change.
        </p>
        <ul className="space-y-2">
          {conflicts.map((conflict) => (
            <li
              key={`${conflict.body}-${conflict.label}`}
              className="rounded-lg border bg-card p-3"
            >
              <div className="mb-1 text-xs font-medium">
                {conflict.body} · shown as &ldquo;{conflict.label}&rdquo;
              </div>
              <VariantList variants={conflict.variants} />
            </li>
          ))}
        </ul>
        <Link href={MANAGE_METRICS}>
          <Button variant="outline" size="sm">
            <Settings className="mr-2 h-4 w-4" />
            Reconcile in the metric catalog
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function VariantList({ variants }: { variants: CategoryVariant[] }) {
  return (
    <ul className="mb-3 space-y-1 text-xs text-muted-foreground">
      {variants.map((variant) => (
        <li key={variant.raw ?? '__null__'} className="flex items-center gap-2">
          <code className="rounded bg-muted px-1.5 py-0.5">
            {variant.raw ?? '(no category)'}
          </code>
          <span>
            {variant.count} metric{variant.count === 1 ? '' : 's'}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The CEO's 48 as a summary view on top of the 107 — or the honest report that
 * nobody has established the correspondence yet.
 *
 * The mapping is a config row (public.iqac_cac_metric_map), never a constant in
 * this codebase, because the config-table rule names mappings explicitly and
 * because a correspondence hardcoded here could only ever be a guess: no
 * verified 48 → 107 correspondence exists today.
 */
function MappingPanel({
  loading,
  registryAvailable,
  summary,
}: {
  loading: boolean;
  registryAvailable: boolean;
  summary: {
    totalDimensions: number;
    mapped: number;
    reviewedAsUnmapped: number;
    unexamined: number;
  };
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Network className="h-5 w-5 text-muted-foreground" />
          The CAC framework as a summary of this one
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          The Cluster Academic Council measures {summary.totalDimensions}{' '}
          dimensions of its own — the CEO&apos;s 48, plus one JKKN added and
          marked as its own. Those are a summary view over the framework on this
          page, not a second framework, so each of them should point at the
          master metrics it summarises. Which dimension points at which metric is
          a decision somebody records, so it is stored as configuration and read
          here at runtime.
        </p>

        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : !registryAvailable ? (
          <div className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            <Link2Off className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              The mapping register has not been created in the database yet, so
              all {summary.totalDimensions}{' '}CAC dimensions read as unmapped.
              Its migration ships with this change as a file and is applied on
              the Director&apos;s approval, like every migration here. Nothing
              has been guessed in the meantime — no correspondence between the
              two frameworks has been established by anybody, and inventing one
              would make an open question look settled.
            </span>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Mapped to a metric" value={String(summary.mapped)} />
            <StatTile
              label="Reviewed, no counterpart"
              value={String(summary.reviewedAsUnmapped)}
            />
            <StatTile label="Not examined yet" value={String(summary.unexamined)} />
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          A dimension nobody has looked at and a dimension somebody checked and
          found no counterpart for are counted apart. Both display as unmapped;
          only one of them still needs doing.
        </p>

        <Link href="/accreditation/cac">
          <Button variant="outline" size="sm">
            <Network className="mr-2 h-4 w-4" />
            Open the CAC dashboard
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
