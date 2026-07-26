// app/(routes)/accreditation/naac/page.tsx
// ============================================================================
// PR-A8 — NAAC Dashboard (Unification Program primary body, 8/15)
//
// IQAC-facing dashboard showing the 10 NAAC attributes, scored in MARKS
// against the Binary deck's 900 ceiling.
//
// 2026-07-27 — this page used to report DOCUMENT COUNTS ("metrics seeded",
// "evidence rows") under a header promising a 900 ceiling, while the catalog's
// max_score column summed to 380 with 25 of 51 rows NULL or 0. Migration
// 20260727090000 digitized the NAAC Reforms 2024 Binary deck, so the ceiling
// is now real; this page reports marks earned / marks possible instead of
// counting rows. The old "coverage formula (placeholder)" caveat is gone —
// the real rule now lives in the footer and in lib/services/.../naac-marks.ts.
//
// Sub-routes:
//   /accreditation/naac/committees   — IQAC committee CRUD
//   /accreditation/naac/dcf-export   — DCF 2025 / AQAR export (super admin)
//   /accreditation/naac/surveys      — 8.4 LES + DPDPA consent
// ============================================================================

'use client';

import { useMemo, useState } from 'react';
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
  ShieldCheck,
  Users,
  BarChart3,
  FileText,
  Download,
  Award,
  ArrowRight,
  Building2,
  BookOpen,
  Briefcase,
  GraduationCap,
  Leaf,
  Flag,
  Heart,
  Microscope,
  Wallet,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { AccreditationService } from '@/lib/services/accreditation/accreditation-service';
import { ACCREDITATION_BODIES } from '@/lib/types/accreditation';
import {
  NAAC_TOTAL_MARKS,
  formatMarks,
  marksPct,
  rollupNaacMarks,
  sumNaacMarks,
} from '@/lib/services/accreditation/naac-marks';
import { QualityLoopsSection } from './_components/quality-loops-section';
import { CopoHeldRollupsSection } from './_components/copo-held-rollups-section';

// ----------------------------------------------------------------------------
// NAAC's 10 attributes (Binary + MBGL framework). Each shows its seeded
// metrics + evidence count. Max score is a sum of per-attribute metric weights.
// ----------------------------------------------------------------------------
interface AttributeMeta {
  key: string;
  name: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}

const NAAC_ATTRIBUTES: AttributeMeta[] = [
  { key: '1', name: 'Curriculum',                   shortLabel: 'Attr 1',  icon: BookOpen,       accent: 'text-indigo-600' },
  { key: '2', name: 'Faculty Resources',             shortLabel: 'Attr 2',  icon: Users,          accent: 'text-blue-600'   },
  { key: '3', name: 'Infrastructure',                shortLabel: 'Attr 3',  icon: Building2,      accent: 'text-sky-600'    },
  { key: '4', name: 'Financial',                     shortLabel: 'Attr 4',  icon: Wallet,         accent: 'text-emerald-600'},
  { key: '5', name: 'Learning & Teaching',           shortLabel: 'Attr 5',  icon: GraduationCap,  accent: 'text-cyan-600'   },
  { key: '6', name: 'Extended Curricular',           shortLabel: 'Attr 6',  icon: Heart,          accent: 'text-rose-600'   },
  { key: '7', name: 'Governance (inc. IQAC + grievance)', shortLabel: 'Attr 7', icon: Flag, accent: 'text-slate-700' },
  { key: '8', name: 'Student Outcomes',              shortLabel: 'Attr 8',  icon: Briefcase,      accent: 'text-amber-600'  },
  { key: '9', name: 'Research & Innovation',         shortLabel: 'Attr 9',  icon: Microscope,     accent: 'text-purple-600' },
  { key: '10', name: 'Sustainability',                shortLabel: 'Attr 10', icon: Leaf,           accent: 'text-green-600'  },
];

// ----------------------------------------------------------------------------
// Hook: get NAAC metrics grouped by attribute
// ----------------------------------------------------------------------------
interface NAACMetric {
  metric_code: string;
  metric_name: string;
  category: string | null;
  max_score: number | null;
}

interface Institution {
  id: string;
  name: string;
  iqac_code: string | null;
  institution_type: string;
}

function useNAACMetrics() {
  return useQuery({
    queryKey: ['accreditation', 'naac', 'metrics'],
    queryFn: async (): Promise<NAACMetric[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('sh_accreditation_metrics')
        .select('metric_code, metric_name, category, max_score')
        .eq('metric_type', 'NAAC')
        .eq('is_active', true)
        .order('metric_code');
      if (error) throw error;
      return (data ?? []) as NAACMetric[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

interface NAACEvidence {
  /** Evidence rows per metric_code across the selected scope. */
  scoped: Record<string, number>;
  /** Evidence rows per institution_id, then per metric_code. */
  byInstitution: Record<string, Record<string, number>>;
}

function useNAACEvidenceCounts(institutionId: string | 'cluster') {
  return useQuery({
    queryKey: ['accreditation', 'naac', 'evidence-counts', institutionId],
    queryFn: async (): Promise<NAACEvidence> => {
      const sb = createClientSupabaseClient() as any;
      // institution_id comes back in the same round-trip so the per-college
      // table needs no extra query and no per-college fan-out.
      let query = sb
        .from('quality_evidence_mappings')
        .select('metric_code, institution_id')
        .eq('body_code', 'NAAC');
      if (institutionId !== 'cluster') {
        query = query.eq('institution_id', institutionId);
      }
      const { data, error } = await query;
      if (error) throw error;
      const scoped: Record<string, number> = {};
      const byInstitution: Record<string, Record<string, number>> = {};
      for (const row of (data ?? []) as {
        metric_code: string;
        institution_id: string | null;
      }[]) {
        scoped[row.metric_code] = (scoped[row.metric_code] ?? 0) + 1;
        if (!row.institution_id) continue;
        const bucket = byInstitution[row.institution_id] ?? {};
        bucket[row.metric_code] = (bucket[row.metric_code] ?? 0) + 1;
        byInstitution[row.institution_id] = bucket;
      }
      return { scoped, byInstitution };
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useJKKNInstitutions() {
  return useQuery({
    queryKey: ['institutions', 'jkkn-iqac'],
    queryFn: async (): Promise<Institution[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('institutions')
        .select('id, name, iqac_code, institution_type')
        .not('iqac_code', 'is', null)
        .order('iqac_code');
      if (error) throw error;
      return (data ?? []) as Institution[];
    },
    staleTime: 30 * 60 * 1000,
  });
}

// ----------------------------------------------------------------------------
// Page component
// ----------------------------------------------------------------------------
export default function NAACDashboardPage() {
  const [selectedInstitution, setSelectedInstitution] = useState<string>('cluster');

  const { data: institutions, isLoading: institutionsLoading } = useJKKNInstitutions();
  const { data: metrics, isLoading: metricsLoading } = useNAACMetrics();
  const { data: evidenceCounts, isLoading: evidenceLoading } = useNAACEvidenceCounts(selectedInstitution);

  const naacMeta = ACCREDITATION_BODIES.find((b) => b.code === 'NAAC')!;

  // Group metrics by attribute (first digit of metric_code, e.g. "2.2.1" → "2").
  // Also handle metric_codes that don't match "N.N.N" (fallback to 'other').
  const metricsByAttribute = (metrics ?? []).reduce<Record<string, NAACMetric[]>>((acc, m) => {
    const attr = m.metric_code.split('.')[0];
    const key = /^\d+$/.test(attr) ? attr : 'other';
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(m);
    return acc;
  }, {});

  // Marks rollup for the selected scope. Evidence on a facet row credits the
  // row that holds the Binary metric's marks — see naac-marks.ts for why a
  // per-catalog-row rollup would silently zero 36% of live NAAC evidence.
  const rollup = useMemo(
    () => rollupNaacMarks(metrics ?? [], evidenceCounts?.scoped ?? {}),
    [metrics, evidenceCounts],
  );

  // One rollup per college, from the same single query.
  const perCollege = useMemo(() => {
    if (!metrics || !evidenceCounts) return [];
    return (institutions ?? []).map((inst) => ({
      inst,
      marks: rollupNaacMarks(metrics, evidenceCounts.byInstitution[inst.id] ?? {}),
    }));
  }, [institutions, metrics, evidenceCounts]);

  const isLoading = metricsLoading || evidenceLoading;
  const coveragePct = marksPct(rollup.marksEarned, NAAC_TOTAL_MARKS);

  return (
    <ContentLayout title="NAAC — IQAC Dashboard">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'NAAC', href: '/accreditation/naac' },
        ]}
      />

      <div className="space-y-6">
        {/* Header */}
        <Card className={`border-2 ${naacMeta.accentClass}`}>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <ShieldCheck className="h-7 w-7 text-indigo-600" />
                  NAAC — IQAC Dashboard
                </CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">
                  Binary + MBGL framework · 10 attributes · Input / Process /
                  Outcome layers. Score ceiling per college: 900. JKKN cluster
                  target: 75% by Jan 2027 (~675 per college, ~5,400 cluster).
                </p>
              </div>

              {/* College switcher */}
              <div className="flex items-center gap-2 min-w-[240px]">
                <Select
                  value={selectedInstitution}
                  onValueChange={setSelectedInstitution}
                  disabled={institutionsLoading}
                >
                  <SelectTrigger className="bg-card">
                    <SelectValue placeholder="Select college" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cluster">Cluster (all 8 colleges)</SelectItem>
                    {(institutions ?? []).map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>
                        {inst.iqac_code ? `[${inst.iqac_code}] ` : ''}
                        {inst.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>

          {/* Stat strip */}
          <CardContent>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Marks earned</div>
                {isLoading ? (
                  <Skeleton className="mt-1 h-8 w-28" />
                ) : (
                  <div className="text-2xl font-bold">
                    {formatMarks(rollup.marksEarned)}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      of {NAAC_TOTAL_MARKS}
                    </span>
                  </div>
                )}
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">
                  Coverage (marks-weighted)
                </div>
                {isLoading ? (
                  <Skeleton className="mt-1 h-8 w-20" />
                ) : (
                  <div className="text-2xl font-bold">{coveragePct}%</div>
                )}
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">
                  Metrics earning marks
                </div>
                {isLoading ? (
                  <Skeleton className="mt-1 h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold">
                    {rollup.metricsEarning}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      of {rollup.metricsWithMarks}
                    </span>
                  </div>
                )}
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Evidence rows</div>
                {isLoading ? (
                  <Skeleton className="mt-1 h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{rollup.evidenceRows}</div>
                )}
              </div>
            </div>

            {selectedInstitution === 'cluster' && (
              <p className="mt-3 text-xs text-muted-foreground">
                <strong>Cluster view is a union, not an average.</strong> A metric
                counts as earned here when <em>any</em>{' '}college has evidence for
                it, so this figure is higher than any single college&apos;s score.
                Pick a college above for a score that college could actually
                claim.
              </p>
            )}

            {/* Quick actions — PR-A8 c2 sub-routes live */}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/accreditation/coverage">
                <Button variant="outline" size="sm">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Coverage matrix
                </Button>
              </Link>
              <Link href="/accreditation/naac/committees">
                <Button variant="outline" size="sm">
                  <Users className="mr-2 h-4 w-4" />
                  IQAC committees
                </Button>
              </Link>
              <Link href="/accreditation/naac/dcf-export">
                <Button variant="outline" size="sm">
                  <FileText className="mr-2 h-4 w-4" />
                  DCF 2025 / AQAR export
                </Button>
              </Link>
              <Link href="/accreditation/naac/surveys/consent">
                <Button variant="outline" size="sm">
                  <Award className="mr-2 h-4 w-4" />
                  Survey consent
                </Button>
              </Link>
              <Link href="/accreditation/naac/surveys/8.4-export">
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  8.4 Survey export
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* 10 attribute cards */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {NAAC_ATTRIBUTES.map((attr) => {
            const metricList = metricsByAttribute[attr.key] ?? [];
            const attrMarks = sumNaacMarks(
              rollup,
              metricList.map((m) => m.metric_code),
            );
            const attrPct = marksPct(attrMarks.marksEarned, attrMarks.marksPossible);
            const Icon = attr.icon;
            return (
              <Card key={attr.key} className="h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className={`h-5 w-5 ${attr.accent}`} />
                      <span>{attr.shortLabel}</span>
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px]">
                      {metricList.length} metrics
                    </Badge>
                  </div>
                  <p className="text-sm font-medium">{attr.name}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isLoading ? (
                    <Skeleton className="h-14 w-full" />
                  ) : (
                    <div>
                      <div className="flex items-baseline justify-between">
                        <div>
                          <span className="text-lg font-semibold">
                            {formatMarks(attrMarks.marksEarned)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {' '}
                            / {formatMarks(attrMarks.marksPossible)} marks
                          </span>
                        </div>
                        <span className="text-sm font-medium">{attrPct}%</span>
                      </div>
                      <div
                        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
                        role="img"
                        aria-label={`${attrPct}% of attribute ${attr.key} marks earned`}
                      >
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(attrPct, 100)}%` }}
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {attrMarks.evidenceRows} evidence row
                        {attrMarks.evidenceRows === 1 ? '' : 's'}
                      </div>
                    </div>
                  )}
                  {metricList.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        {metricList.length} metric{metricList.length === 1 ? '' : 's'}
                      </summary>
                      <ul className="mt-2 space-y-1.5 pl-2">
                        {metricList.map((m) => {
                          const row = rollup.byCode[m.metric_code];
                          const possible = row?.marksPossible ?? 0;
                          const earned = row?.marksEarned ?? 0;
                          return (
                            <li key={m.metric_code} className="space-y-0.5">
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-mono text-[11px] text-muted-foreground">
                                  {m.metric_code}
                                </span>
                                <span className="flex-1 text-[11px]">{m.metric_name}</span>
                                <Badge
                                  variant={earned > 0 ? 'default' : 'secondary'}
                                  className="shrink-0 text-[9px]"
                                >
                                  {formatMarks(earned)} / {formatMarks(possible)}
                                </Badge>
                              </div>
                              {/* Honesty rules: a zero is never blank and never
                                  hidden — it always says which kind of zero. */}
                              {possible > 0 && earned === 0 && (
                                <div className="pl-2 text-[10px] text-amber-700 dark:text-amber-500">
                                  0 earned — no evidence yet ({formatMarks(possible)} marks
                                  available)
                                </div>
                              )}
                              {possible === 0 && row?.zeroLabel && (
                                <div className="pl-2 text-[10px] text-muted-foreground">
                                  {row.zeroReason === 'affiliated_only' ? '⚑ ' : ''}
                                  {row.zeroLabel}
                                  {row.evidenceRows > 0
                                    ? ` (${row.evidenceRows} evidence row${
                                        row.evidenceRows === 1 ? '' : 's'
                                      } filed here)`
                                    : ''}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Per-college marks — every college named, zero shown as zero */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Marks by college</CardTitle>
            <p className="text-xs text-muted-foreground">
              Colleges your access covers. Evidence rows are institution-scoped,
              so a college you cannot see reads 0 here — that is an access limit,
              not a score. Scored against the Autonomous ceiling of{' '}
              {NAAC_TOTAL_MARKS} (see the note below for self / aided colleges).
            </p>
          </CardHeader>
          <CardContent>
            {isLoading || institutionsLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-3 font-medium">College</th>
                      <th className="pb-2 pr-3 font-medium">Type</th>
                      <th className="pb-2 pr-3 text-right font-medium">Marks</th>
                      <th className="pb-2 pr-3 text-right font-medium">%</th>
                      <th className="pb-2 text-right font-medium">Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perCollege.map(({ inst, marks }) => {
                      const pct = marksPct(marks.marksEarned, NAAC_TOTAL_MARKS);
                      return (
                        <tr key={inst.id} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            <span className="font-mono text-xs text-muted-foreground">
                              {inst.iqac_code ?? '—'}
                            </span>{' '}
                            {inst.name}
                          </td>
                          <td className="py-2 pr-3">
                            <Badge variant="outline" className="text-[10px]">
                              {inst.institution_type}
                            </Badge>
                          </td>
                          <td className="py-2 pr-3 text-right font-medium">
                            {formatMarks(marks.marksEarned)}
                            <span className="text-muted-foreground">
                              {' '}
                              / {NAAC_TOTAL_MARKS}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-right">{pct}%</td>
                          <td className="py-2 text-right text-muted-foreground">
                            {marks.evidenceRows}
                          </td>
                        </tr>
                      );
                    })}
                    {perCollege.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-3 text-center text-xs text-muted-foreground"
                        >
                          No colleges with an IQAC code are visible to your account.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quality Loops — Metric 7.3 QAS (Loop → accreditation bridge, PR-2 of 2) */}
        <QualityLoopsSection selectedInstitution={selectedInstitution} />

        {/* Twin-college re-stamp control (Director 2026-07-10) — renders only
            for super admins + accreditation.evidence.restamp holders */}
        <CopoHeldRollupsSection />

        {/* Footer */}
        <Card className="bg-muted/30">
          <CardContent className="pt-6 text-xs text-muted-foreground space-y-2">
            <p>
              <strong>How these marks are scored.</strong> Marks come from the NAAC
              Reforms 2024 Binary deck (pp.41-63), <strong>Autonomous column</strong>
              , digitized into the metric catalog by migration 20260727090000 —
              active NAAC metrics sum to exactly {NAAC_TOTAL_MARKS}. The Binary
              framework is yes/no, so a metric earns its <em>full</em> marks once
              verified evidence exists against it (or against one of its declared
              facet rows, e.g. 7.3.d credits 7.3), and <em>zero</em>{' '}otherwise.
              There is no partial credit inside a metric. Attribute 2&apos;s
              sub-scores exceed its attribute total in the deck itself (85 printed
              vs 50 allotted), so they are scaled 50/85; the 0.01 that 2-decimal
              rounding leaves over is absorbed on 2.2.3 so Attribute 2 sums to
              exactly 50.
            </p>
            <p>
              <strong>Why the percentage dropped.</strong> Until 2026-07-27 this
              page counted documents (evidence rows / metrics seeded) and the
              catalog only carried 380 marks across 51 rows, 25 of them NULL or 0.
              Every percentage was measured against a denominator less than half
              the truth. Coverage did not get worse — the ceiling became true, and
              18 real deck metrics worth 180 marks that had no catalog row at all
              are now counted.
            </p>
            <p>
              <strong>Open Director decisions, not settled here.</strong>{' '}Live
              college types are autonomous (5), self (2) and aided (1) — there is
              no &quot;affiliated&quot; type in the platform, so one{' '}
              <code>max_score</code> column cannot express both deck columns and
              all 8 colleges are scored against the <em>Autonomous</em>{' '}ceiling.
              Whether self / aided colleges should instead be scored on the
              deck&apos;s Affiliated column is undecided. That column is also
              unreconciled at source: it totals <strong>860, not 900</strong> — a
              40-mark double-count where the deck shifts metrics 1.4/1.6/1.7 into
              5.4/5.5/5.3 for affiliated colleges while still printing the
              Attribute-1 marks. Metric 8.2.2 (pass percentage) is affiliated-only
              and shows as ⚑ flagged with 0 earned: its evidence is real and
              visible, but the deck gives it no Autonomous marks and it is{' '}
              <em>not</em> a facet of 8.2.1.
            </p>
            <p>
              Sibling body dashboards (<code>/accreditation</code>,{' '}
              <code>/accreditation/coverage</code> and the 9 other bodies) still
              report the old evidence-row coverage, so their numbers will disagree
              with this page until they are converted too. Known and deliberate —
              this change covers NAAC only.
            </p>
            <p>
              <strong>Principal = IQAC Chairman</strong> by NAAC mandate. HoDs
              are Department IQAC Coordinators. Continuous-improvement is the
              methodology; IQAC is not a separate committee below the Principal
              but the discipline embedded at every governance level.
            </p>
            <p>
              Evidence rows are auto-emitted by fan-out triggers (PR-A5
              anti-ragging → 7.7.1; PR-A3 admission → 8.1.1 on demand).
              Additional fan-outs will wire up as each source module is retrofitted.
            </p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
