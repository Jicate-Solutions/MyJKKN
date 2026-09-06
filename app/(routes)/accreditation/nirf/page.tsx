// app/(routes)/accreditation/nirf/page.tsx
// ============================================================================
// /accreditation/nirf — NIRF Ranking Dashboard (PR-A9 — Unification 9/15).
//
// The 5 canonical NIRF parameters (weights sum to 100%):
//   1. TLR  Teaching, Learning & Resources        30%
//   2. RPC  Research & Professional Practice       30%
//   3. GO   Graduation Outcomes                    20%
//   4. OI   Outreach & Inclusivity                 10%
//   5. PR   Perception (peer survey)               10%
//
// Scope: a college switcher, since each college submits its own NIRF data.
// Its rows and its heading come from _lib/visible-institutions.ts and describe
// the colleges the SIGNED-IN READER can see — not a fixed count of eight.
// Evidence sourced from PR-A2 substrate.
//
// NOTE: sidebar entry + permission key `accreditation.nirf.view` ship with
// PR-A8 c2 (#255) — this PR only adds the page + hook.
//
// ----------------------------------------------------------------------------
// 2026-08-09: NO PER-METRIC CELL ON THIS PAGE MAY RENDER A BARE 0
// ----------------------------------------------------------------------------
// Every sub-metric used to read `evidenceCounts?.[code] ?? 0`. To an assessor a
// 0 is a MEASUREMENT — we looked, and there is none — which is a finding against
// the college. "Nothing feeds this metric yet" is a finding against the
// platform. One display was carrying both claims, and `?? 0` was the character
// that fused them. After migration 20260809100200 seeds NIRF, 13 of the 17
// metrics would have read "0", including PR_PEER, which NIRF sources from its
// own peer survey and JKKN cannot hold at all.
//
// The decision now lives in _lib/metric-gap-state.ts, which is pure and tested.
// Do not reintroduce a coalesce anywhere between the hook and the badge.
//
// SCOPE OF THAT RULE, stated precisely because the first draft of this comment
// overstated it: it binds every PER-METRIC cell. The headline "Evidence rows"
// tile is a row COUNT across the page, not a claim about any one metric, so a
// 0 there means "no evidence rows are loaded" and is honest. If that tile ever
// starts making a per-metric claim, it comes under this rule too.
// ============================================================================

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TrendingUp,
  GraduationCap,
  Microscope,
  Briefcase,
  Users as UsersIcon,
  Sparkles,
  BarChart3,
  ArrowUpRight,
} from 'lucide-react';
import { ACCREDITATION_BODIES } from '@/lib/types/accreditation';
import {
  useNIRFMetrics,
  useNIRFEvidenceCounts,
  type NIRFMetric,
} from '@/hooks/accreditation/use-nirf-dashboard';
import { useVisibleInstitutions } from '@/hooks/accreditation/use-visible-institutions';
import { AGGREGATE_SCOPE } from '../_lib/visible-institutions';
import { NoVisibleColleges } from '../_components/no-visible-colleges';
import {
  useEvidenceSourceRoutes,
  useMetricOwnerNames,
} from '@/hooks/accreditation/use-evidence-fix-routes';
import {
  resolveMetricGap,
  nirfSourceFor,
  countGaps,
  measuredTotal,
  type EvidenceSourceRoute,
  type MetricGapDisplay,
} from '@/app/(routes)/accreditation/_lib/metric-gap-state';

interface ParameterMeta {
  code: 'TLR' | 'RPC' | 'GO' | 'OI' | 'PR';
  name: string;
  fullName: string;
  weight: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  description: string;
  subMetrics: string[];
}

const NIRF_PARAMETERS: ParameterMeta[] = [
  {
    code: 'TLR',
    name: 'Teaching, Learning & Resources',
    fullName: 'TLR',
    weight: 30,
    icon: GraduationCap,
    accent: 'text-indigo-600',
    description:
      'Student strength, faculty-student ratio, faculty qualification & experience, financial resources.',
    subMetrics: ['TLR_SS', 'TLR_FSR', 'TLR_FQE', 'TLR_FRU'],
  },
  {
    code: 'RPC',
    name: 'Research & Professional Practice',
    fullName: 'RPC',
    weight: 30,
    icon: Microscope,
    accent: 'text-purple-600',
    description:
      'Publications, quality publications, IPR/patents, footprint & external funding.',
    subMetrics: ['RPC_PU', 'RPC_QP', 'RPC_IPR', 'RPC_FPPP'],
  },
  {
    code: 'GO',
    name: 'Graduation Outcomes',
    fullName: 'GO',
    weight: 20,
    icon: Briefcase,
    accent: 'text-emerald-600',
    description:
      'University exam perf, higher studies progression, median salary, PhD graduates.',
    subMetrics: ['GO_GUE', 'GO_GPH', 'GO_GMS', 'GO_GPHD'],
  },
  {
    code: 'OI',
    name: 'Outreach & Inclusivity',
    fullName: 'OI',
    weight: 10,
    icon: UsersIcon,
    accent: 'text-rose-600',
    description:
      'Regional diversity, women diversity, economic/social disadvantaged, physically challenged.',
    subMetrics: ['OI_RD', 'OI_WD', 'OI_ESCS', 'OI_PCS'],
  },
  {
    code: 'PR',
    name: 'Perception',
    fullName: 'PR',
    weight: 10,
    icon: Sparkles,
    accent: 'text-amber-600',
    description: 'Peer perception — employer + academic survey.',
    subMetrics: ['PR_PR'],
  },
];

// Group metrics by parameter code prefix (e.g. "TLR_SS" → "TLR").
function groupMetricsByParameter(metrics: NIRFMetric[]): Record<string, NIRFMetric[]> {
  return metrics.reduce<Record<string, NIRFMetric[]>>((acc, m) => {
    const code = m.metric_code.toUpperCase();
    // Match against known parameter codes
    const param = NIRF_PARAMETERS.find((p) =>
      code.startsWith(`${p.code}_`) || code === p.code,
    );
    const key = param?.code ?? 'OTHER';
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(m);
    return acc;
  }, {});
}

/**
 * One sub-metric's cell, as words rather than a number.
 *
 * A "Fix this" link appears ONLY when the registry gave a destination. A source
 * with no verified route renders the gap and stops — a dead link is worse than
 * no link, because it looks like an instruction and gives none.
 */
function MetricGapRow({ metric, display }: { metric: NIRFMetric; display: MetricGapDisplay }) {
  const isMeasured = display.state === 'measured';

  return (
    <li className="space-y-1 border-b border-dashed py-1.5 last:border-b-0">
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">
          {metric.metric_code}
        </span>
        <span className="flex-1 text-[11px]">{metric.metric_name}</span>
        <Badge
          variant={isMeasured ? 'secondary' : 'outline'}
          className={
            isMeasured
              ? 'text-[9px]'
              : 'shrink-0 border-amber-400 text-[9px] font-normal text-amber-700 dark:text-amber-400'
          }
        >
          {display.label}
        </Badge>
      </div>

      {!isMeasured && (
        <div className="space-y-1 pl-1 text-[10px] leading-snug text-muted-foreground">
          {display.detail && <p>{display.detail}</p>}
          {display.ownerLine && <p className="font-medium">{display.ownerLine}</p>}
          {display.fixRoute && (
            <Link href={display.fixRoute}>
              <Button variant="link" size="sm" className="h-auto p-0 text-[10px]">
                Fix this
                <ArrowUpRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          )}
        </div>
      )}
    </li>
  );
}

export default function NIRFDashboardPage() {
  // The switcher's rows and its heading come from the scope module, so this
  // page decides nothing about what it may claim. `defaultSelection` is a
  // college id (not 'cluster') for a reader entitled to one college — that
  // reader is never offered an aggregate row.
  const {
    options: scopeOptions,
    defaultSelection,
    state: scopeState,
    isLoading: instLoading,
  } = useVisibleInstitutions();
  const [picked, setPicked] = useState<string | null>(null);
  const selectedInstitution =
    picked && scopeOptions.some((o) => o.value === picked) ? picked : defaultSelection;
  const setSelectedInstitution = setPicked;

  // In the `none-visible` state `selectedInstitution` is NO_VISIBLE_SCOPE, which
  // is not a uuid — passing it through would become `.eq('institution_id', …)`
  // and fail with a 22P02. The page discards the result below either way, so it
  // asks the same cluster question these readers already send today.
  const evidenceScope =
    scopeState === 'none-visible' ? AGGREGATE_SCOPE : selectedInstitution;

  const { data: metrics, isLoading: metricsLoading } = useNIRFMetrics();
  const { data: evidenceCounts, isLoading: evidenceLoading } = useNIRFEvidenceCounts(
    evidenceScope as any,
  );
  const { data: sourceRoutes, isSuccess: routesRead } = useEvidenceSourceRoutes();
  const { data: ownerNames, isSuccess: ownersRead } = useMetricOwnerNames(
    'NIRF',
    evidenceScope,
  );

  // `sourceRoutes ?? {}` would have made a FAILED read look like an empty
  // registry, and every metric would then claim "nothing feeds this" on the
  // strength of a request that never answered. Same treatment as the owner
  // read below: only assert once the register has actually been read.
  const registry: Record<string, EvidenceSourceRoute> = sourceRoutes ?? {};

  /**
   * Resolve one metric's cell.
   *
   * `evidenceCounts?.[code]` is passed through UNCOALESCED — undefined means no
   * evidence row exists and must stay distinguishable from a measured 0.
   *
   * Owner: `null` only once the register has actually been read (`ownersRead`),
   * otherwise `undefined`, so the page never claims "nobody is assigned" on the
   * strength of a request that has not answered.
   *
   * Source: the same rule, for the same reason (`routesRead`). A failed registry
   * read must read as "could not load", never as "nothing feeds this metric".
   *
   * TODO(#2784): once `_lib/body-applicability.ts` merges, pass its verdict as
   * `applicability` so a body that does not inspect this college reads "Does not
   * apply" instead of a gap. Not derived here — one answer, one owner.
   */
  const displayFor = (m: NIRFMetric): MetricGapDisplay =>
    resolveMetricGap({
      metricCode: m.metric_code,
      count: evidenceCounts?.[m.metric_code],
      source: routesRead ? nirfSourceFor(m.metric_code, registry) : undefined,
      owner: ownersRead ? (ownerNames?.[m.metric_code] ?? null) : undefined,
    });

  const nirfMeta = ACCREDITATION_BODIES.find((b) => b.code === 'NIRF')!;

  const metricsByParameter = groupMetricsByParameter(metrics ?? []);
  const totalMetrics = (metrics ?? []).length;
  const totalMaxScore = (metrics ?? []).reduce((s, m) => s + (m.max_score ?? 0), 0);
  const totalEvidence = Object.values(evidenceCounts ?? {}).reduce((s, n) => s + n, 0);

  // No accredited college in this reader's access. Every figure below folds
  // through the visible-college list, so rendering the dashboard would print a
  // measured nought — see _components/no-visible-colleges.tsx for why that is
  // refused rather than dashed out.
  if (scopeState === 'none-visible') {
    return (
      <NoVisibleColleges
        title="NIRF — Ranking Dashboard"
        bodyLabel="NIRF"
        bodyHref="/accreditation/nirf"
      />
    );
  }

  return (
    <ContentLayout title="NIRF — Ranking Dashboard">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'NIRF', href: '/accreditation/nirf' },
        ]}
      />

      <div className="space-y-6">
        {/* Header */}
        <Card className={`border-2 ${nirfMeta.accentClass}`}>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <TrendingUp className="h-7 w-7 text-amber-600" />
                  NIRF — National Institutional Ranking Framework
                </CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">
                  MoE annual ranking. 5 parameters, weighted 30 + 30 + 20 + 10 + 10 = 100%.
                  Each JKKN college submits its own data — the aggregate view adds up
                  evidence across the colleges you can see.
                </p>
              </div>

              <div className="min-w-[240px]">
                <Select
                  value={selectedInstitution}
                  onValueChange={setSelectedInstitution}
                  disabled={instLoading}
                >
                  <SelectTrigger className="bg-card">
                    <SelectValue placeholder="Select college" />
                  </SelectTrigger>
                  <SelectContent>
                    {scopeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Metrics seeded</div>
                <div className="text-2xl font-bold">
                  {metricsLoading ? '—' : totalMetrics}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Max score tracked</div>
                <div className="text-2xl font-bold">
                  {metricsLoading ? '—' : totalMaxScore}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Evidence rows</div>
                <div className="text-2xl font-bold">
                  {evidenceLoading ? '—' : totalEvidence}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Cycle</div>
                <div className="text-lg font-semibold">Annual</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/accreditation/coverage">
                <Button variant="outline" size="sm">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Coverage matrix
                </Button>
              </Link>
              <Button variant="outline" size="sm" disabled title="Lands when full NIRF rubric seeded">
                View full rubric (soon)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 5 parameter cards */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {NIRF_PARAMETERS.map((param) => {
            const metricList = metricsByParameter[param.code] ?? [];
            const paramMax = metricList.reduce((s, m) => s + (m.max_score ?? 0), 0);
            // Same rule one level up: a parameter where nothing is captured
            // must not total to 0, which would read as a measured result for
            // the whole parameter.
            const displays = metricList.map(displayFor);
            const paramEvidence = measuredTotal(displays);
            const paramGaps = countGaps(displays);
            const Icon = param.icon;
            return (
              <Card key={param.code} className="h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className={`h-5 w-5 ${param.accent}`} />
                      <span>{param.fullName}</span>
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px]">
                      weight {param.weight}%
                    </Badge>
                  </div>
                  <p className="text-sm font-medium">{param.name}</p>
                  <p className="text-xs text-muted-foreground">{param.description}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Max score</div>
                      <div className="text-lg font-semibold">{paramMax || '—'}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Evidence</div>
                      <div className="text-lg font-semibold">
                        {paramEvidence === null ? 'Not captured yet' : paramEvidence}
                      </div>
                      {paramGaps > 0 && paramEvidence !== null && (
                        <div className="text-[10px] text-amber-700 dark:text-amber-400">
                          {paramGaps} not captured yet
                        </div>
                      )}
                    </div>
                  </div>
                  {metricList.length > 0 && (
                    // Open when there is a gap inside: a collapsed summary that
                    // says "3 not captured yet" and hides the instruction is
                    // the same dead end as the 0 badge, one click further away.
                    <details className="text-xs" open={paramGaps > 0}>
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        {metricList.length} sub-metric{metricList.length === 1 ? '' : 's'}
                        {paramGaps > 0 && ` · ${paramGaps} not captured yet`}
                      </summary>
                      <ul className="mt-2 pl-2">
                        {metricList.map((m, i) => (
                          <MetricGapRow
                            key={m.metric_code}
                            metric={m}
                            display={displays[i]!}
                          />
                        ))}
                      </ul>
                    </details>
                  )}
                  {metricList.length === 0 && !metricsLoading && (
                    <p className="text-xs italic text-muted-foreground">
                      No sub-metrics seeded — expected sub-codes: {param.subMetrics.join(', ')}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Footer */}
        <Card className="bg-muted/30">
          <CardContent className="pt-6 text-xs text-muted-foreground space-y-2">
            <p>
              <strong>PublicationsService re-use:</strong> the existing{' '}
              <code>PublicationsService.calculateNIRFMetrics()</code> in Solutions
              Hub already computes publication counts + h-index + quality (Scopus/WoS)
              for the RPC parameter. Future enhancement will wire the live result into
              this dashboard in place of the evidence-row count.
            </p>
            <p>
              <strong>Coverage formula (placeholder):</strong> evidence_rows /
              metrics_seeded. The real NIRF weighted formula (per official MoE rubric)
              lands once the full 14-sub-metric catalog is seeded and per-college
              submission templates are built.
            </p>
            <p>
              Evidence flows via PR-A3 fan-out (admission → TLR_SS) and future
              research-module fan-out (publications → RPC_PU / RPC_QP). Other parameters
              land as each source module is retrofitted under the Compliance Unification
              Program.
            </p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
