// app/(routes)/pde/admin/accreditation-evidence/[body]/page.tsx
// ============================================================================
// PR-A4 (Compliance Unification Program 2026-04-17): renamed from
// /pde/admin/naac-evidence to /pde/admin/accreditation-evidence/[body].
// Old URL 308-redirects to /pde/admin/accreditation-evidence/naac via
// next.config.ts redirects().
//
// PDE Tier 4 T4.5 (2026-05-19): wired to `pde_demonstrations` via
// `PDEAccreditationEvidenceService`. ALL supported bodies now render the
// 7-category PDE evidence packet (validated/scored demonstrations grouped
// by category). NAAC additionally renders the legacy engagement / OBE /
// Fink's / agency / innovation metrics it had pre-T4.5.
// ============================================================================

'use client';

import { use, useCallback } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import {
  Download, BarChart3, GraduationCap, Activity, Lightbulb, TrendingUp, AlertCircle, FileCheck2,
} from 'lucide-react';
import type { AccreditationBodyCode } from '@/lib/services/solutions/types';
import type { AccreditationEvidencePacket } from '@/lib/services/pde-accreditation-evidence-service';
import type { CurriculumAttainmentResult } from '@/lib/types/pde-curriculum';

const SUPPORTED_BODIES: AccreditationBodyCode[] = [
  'NAAC','NIRF','NBA','QS','DCI','PCI','INC','AICTE','NCTE','UGC',
];
// T4.5 (2026-05-19): every supported body now renders the PDE demonstrations
// evidence packet via `/api/pde/accreditation-evidence/[body]`. NAAC ALSO
// renders the legacy engagement / OBE / Fink's / agency / innovation cards.
const NAAC_RICH_LEGACY_BODIES: AccreditationBodyCode[] = ['NAAC'];

// CSV Export
function downloadCSV(data: Record<string, unknown>[], filename: string) {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row =>
      headers.map(h => {
        const val = row[h];
        const str = val == null ? '' : String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(',')
    ),
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Hooks
function useNAACEngagement() {
  return useQuery({
    queryKey: ['pde', 'naac', 'engagement'],
    queryFn: async () => {
      const { createClientSupabaseClient } = await import('@/lib/supabase/client');
      const sb = createClientSupabaseClient() as any;
      const [enr, comp, subs, passed, eng, certs] = await Promise.all([
        sb.from('pde_quest_enrollments').select('*', { count: 'exact', head: true }),
        sb.from('pde_quest_enrollments').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
        sb.from('pde_submissions').select('*', { count: 'exact', head: true }),
        sb.from('pde_submissions').select('*', { count: 'exact', head: true }).eq('passed', true),
        sb.from('pde_engagement_daily').select('time_spent_minutes'),
        sb.from('pde_certificates').select('*', { count: 'exact', head: true }),
      ]);
      const avgTime = eng.data?.length ? Math.round(eng.data.reduce((s: number, r: any) => s + (r.time_spent_minutes || 0), 0) / eng.data.length) : 0;
      return {
        totalEnrollments: enr.count || 0,
        completedEnrollments: comp.count || 0,
        completionRate: enr.count ? Math.round(((comp.count || 0) / enr.count) * 100) : 0,
        totalSubmissions: subs.count || 0,
        passedSubmissions: passed.count || 0,
        assessmentPassRate: subs.count ? Math.round(((passed.count || 0) / subs.count) * 100) : 0,
        avgTimeOnTask: avgTime,
        certificatesIssued: certs.count || 0,
      };
    },
  });
}

function useNAACOBE() {
  return useQuery({
    queryKey: ['pde', 'naac', 'obe'],
    queryFn: async () => {
      const { createClientSupabaseClient } = await import('@/lib/supabase/client');
      const sb = createClientSupabaseClient() as any;
      const { data: caps } = await sb.from('pde_capabilities').select('id, name, category, level').order('category').order('level');
      if (!caps?.length) return [];
      const results = [];
      for (const cap of caps) {
        const { count: demonstrated } = await sb.from('pde_learner_capabilities').select('*', { count: 'exact', head: true }).eq('capability_id', cap.id).in('status', ['demonstrated', 'mastered']);
        const { count: total } = await sb.from('pde_learner_capabilities').select('*', { count: 'exact', head: true }).eq('capability_id', cap.id);
        results.push({
          capability_name: cap.name, category: cap.category, level: cap.level,
          demonstrated_count: demonstrated || 0, total_enrolled: total || 0,
          attainment_pct: total ? Math.round(((demonstrated || 0) / total) * 100) : 0,
        });
      }
      return results;
    },
  });
}

function useNAACFinks() {
  return useQuery({
    queryKey: ['pde', 'naac', 'finks'],
    queryFn: async () => {
      const { createClientSupabaseClient } = await import('@/lib/supabase/client');
      const sb = createClientSupabaseClient() as any;
      const { data: certs } = await sb.from('pde_certificates').select('finks_profile').not('finks_profile', 'is', null);
      const dims = ['foundational_knowledge', 'application', 'integration', 'human_dimension', 'caring', 'learning_how_to_learn'];
      const results: Record<string, { avg: number; count: number; min: number; max: number }> = {};
      for (const dim of dims) {
        const values = (certs || []).map((c: any) => c.finks_profile?.[dim]).filter((v: any): v is number => v != null);
        results[dim] = {
          avg: values.length ? Math.round(values.reduce((s: number, v: number) => s + v, 0) / values.length) : 0,
          count: values.length, min: values.length ? Math.min(...values) : 0, max: values.length ? Math.max(...values) : 0,
        };
      }
      return results;
    },
  });
}

function useNAACAgency() {
  return useQuery({
    queryKey: ['pde', 'naac', 'agency'],
    queryFn: async () => {
      const { createClientSupabaseClient } = await import('@/lib/supabase/client');
      const sb = createClientSupabaseClient() as any;
      const { data } = await sb.from('pde_agency_index').select('learner_id, overall, level').order('assessment_date', { ascending: false });
      if (!data?.length) return { distribution: {} as Record<string, number>, total: 0 };
      const latest = new Map<string, { overall: number; level: string }>();
      for (const r of data) { if (!latest.has(r.learner_id)) latest.set(r.learner_id, { overall: r.overall, level: r.level }); }
      const dist: Record<string, number> = { dependent: 0, directed: 0, independent: 0, self_directed: 0, principal: 0 };
      for (const { level } of latest.values()) { if (dist[level] !== undefined) dist[level]++; }
      return { distribution: dist, total: latest.size };
    },
  });
}

function useNAACInnovation() {
  return useQuery({
    queryKey: ['pde', 'naac', 'innovation'],
    queryFn: async () => {
      const { createClientSupabaseClient } = await import('@/lib/supabase/client');
      const sb = createClientSupabaseClient() as any;
      const [qc, sd, nif, pr] = await Promise.all([
        sb.from('pde_quest_enrollments').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
        sb.from('pde_quests').select('*', { count: 'exact', head: true }).eq('solutions_hub_eligible', true).eq('status', 'completed'),
        sb.from('pde_quests').select('*', { count: 'exact', head: true }).eq('nif_eligible', true),
        sb.from('pde_reputation').select('peer_reviews_given').gt('peer_reviews_given', 0),
      ]);
      return { questsCompleted: qc.count || 0, solutionsDeployed: sd.count || 0, nifSubmissions: nif.count || 0, peerReviews: pr.count || 0 };
    },
  });
}

// Curriculum connector — CLO/PO attainment computed from validated
// demonstrations (spec: specs/pde-bos-outcome-connector-2026-06-11.md §7).
function useCurriculumAttainment() {
  return useQuery<CurriculumAttainmentResult>({
    queryKey: ['pde', 'curriculum', 'attainment'],
    queryFn: async () => {
      const res = await fetch('/api/pde/curriculum/attainment', { cache: 'no-store' });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`attainment fetch failed: ${res.status} ${txt}`);
      }
      const json = await res.json();
      return json.data as CurriculumAttainmentResult;
    },
  });
}

// T4.5 — PDE demonstrations packet (per-body aggregator over pde_demonstrations).
function usePDEDemonstrationsEvidence(body: AccreditationBodyCode) {
  return useQuery<AccreditationEvidencePacket>({
    queryKey: ['pde', 'accreditation-evidence', body],
    queryFn: async () => {
      const res = await fetch(
        `/api/pde/accreditation-evidence/${body.toLowerCase()}`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`evidence fetch failed: ${res.status} ${txt}`);
      }
      const json = await res.json();
      return json.data as AccreditationEvidencePacket;
    },
  });
}

const FINKS_LABELS: Record<string, string> = {
  foundational_knowledge: 'Foundational Knowledge', application: 'Application', integration: 'Integration',
  human_dimension: 'Human Dimension', caring: 'Caring', learning_how_to_learn: 'Learning How to Learn',
};
// Agency levels are the OPERATING MODE a learner is currently working in,
// not an identity (Dweck / CARE-Recognition copy rule — connector spec §4.7).
const AGENCY_LABELS: Record<string, string> = {
  dependent: 'Dependent mode', directed: 'Directed mode', independent: 'Independent mode', self_directed: 'Self-Directed mode', principal: 'Principal mode',
};

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

// T4.5 — evidence section that surfaces pde_demonstrations grouped by the
// 7 PDE categories. Renders for every supported body.
function PDEDemonstrationsEvidenceSection({
  body,
}: {
  body: AccreditationBodyCode;
}) {
  const evidence = usePDEDemonstrationsEvidence(body);

  const downloadAllAsCSV = useCallback(() => {
    if (!evidence.data) return;
    const rows = evidence.data.by_category.map((b) => ({
      category: b.category_label,
      submitted: b.counts.submitted,
      validated: b.counts.validated,
      scored: b.counts.scored,
      passed: b.counts.passed,
      pass_rate_pct:
        b.counts.scored > 0
          ? Math.round((b.counts.passed / b.counts.scored) * 100)
          : 0,
    }));
    downloadCSV(rows as any, `${body.toLowerCase()}-pde-evidence.csv`);
  }, [evidence.data, body]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileCheck2 className="w-5 h-5 text-indigo-600" />
          PDE Demonstrations Evidence
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={downloadAllAsCSV}
          disabled={!evidence.data}
        >
          <Download className="w-4 h-4 mr-1" /> CSV
        </Button>
      </CardHeader>
      <CardContent>
        {evidence.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : evidence.isError ? (
          <p className="text-sm text-red-600">
            Failed to load PDE evidence: {String((evidence.error as any)?.message ?? 'unknown error')}
          </p>
        ) : evidence.data ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {evidence.data.total_demonstrations} demonstrations aggregated from{' '}
              <code className="text-xs">pde_demonstrations</code>. Generated{' '}
              {new Date(evidence.data.generated_at).toLocaleString()}.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Submitted</TableHead>
                  <TableHead className="text-right">Validated</TableHead>
                  <TableHead className="text-right">Scored</TableHead>
                  <TableHead className="text-right">Passed</TableHead>
                  <TableHead className="text-right">Pass Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evidence.data.by_category.map((bucket) => {
                  const passRate =
                    bucket.counts.scored > 0
                      ? Math.round(
                          (bucket.counts.passed / bucket.counts.scored) * 100
                        )
                      : 0;
                  return (
                    <TableRow key={bucket.category_key}>
                      <TableCell className="font-medium capitalize">
                        {bucket.category_label}
                      </TableCell>
                      <TableCell className="text-right">
                        {bucket.counts.submitted}
                      </TableCell>
                      <TableCell className="text-right">
                        {bucket.counts.validated}
                      </TableCell>
                      <TableCell className="text-right">
                        {bucket.counts.scored}
                      </TableCell>
                      <TableCell className="text-right">
                        {bucket.counts.passed}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        <span
                          className={
                            passRate >= 60
                              ? 'text-emerald-600'
                              : passRate >= 30
                              ? 'text-amber-600'
                              : bucket.counts.scored > 0
                              ? 'text-red-600'
                              : 'text-muted-foreground'
                          }
                        >
                          {bucket.counts.scored > 0 ? `${passRate}%` : '—'}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Sample evidence per category (only categories with rows) */}
            {evidence.data.by_category.some((b) => b.sample_evidence.length > 0) && (
              <div className="space-y-3 pt-2">
                <h3 className="text-sm font-semibold">Sample Evidence (most recent)</h3>
                {evidence.data.by_category
                  .filter((b) => b.sample_evidence.length > 0)
                  .map((bucket) => (
                    <div key={bucket.category_key} className="border rounded-md p-3">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className="capitalize text-xs">
                          {bucket.category_label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {bucket.sample_evidence.length} of {bucket.counts.scored} scored
                        </span>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Skill</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Score</TableHead>
                            <TableHead className="text-right">Passed</TableHead>
                            <TableHead className="text-right">Scored At</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bucket.sample_evidence.map((s) => (
                            <TableRow key={s.id}>
                              <TableCell className="font-medium">
                                {s.skill_name ?? '—'}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {s.evidence_type ?? '—'}
                              </TableCell>
                              <TableCell className="text-right">
                                {s.weighted_score ?? '—'}
                              </TableCell>
                              <TableCell className="text-right">
                                {s.passed === true
                                  ? '✓'
                                  : s.passed === false
                                  ? '✗'
                                  : '—'}
                              </TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">
                                {s.scored_at
                                  ? new Date(s.scored_at).toLocaleDateString()
                                  : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">No evidence yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

// Curriculum connector — "CLO/PO attainment from PDE evidence" (every body).
// Denominator is PARTICIPATING learners (≥1 demo on the syllabus) — labeled,
// per the locked spec §4.2. Sections by syllabus VERSION (version pinning).
function CLOPOAttainmentSection() {
  const attainment = useCurriculumAttainment();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <GraduationCap className="w-5 h-5 text-[#0b6d41]" />
          CLO/PO Attainment from PDE Evidence
        </CardTitle>
        <Link href="/academic/obe/co-po-mapping" className="text-xs underline text-muted-foreground">
          Exam-based OBE (CO–PO mapping) →
        </Link>
      </CardHeader>
      <CardContent>
        {attainment.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : attainment.isError ? (
          <p className="text-sm text-red-600">
            Failed to load attainment: {String((attainment.error as any)?.message ?? 'unknown error')}
          </p>
        ) : attainment.data && attainment.data.syllabi.length > 0 ? (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Evidence-based attainment from validated demonstrations linked to BoS syllabi.
              Percentages are <span className="font-medium">of participating learners</span>{' '}
              (learners with ≥1 demonstration on that syllabus) and count only
              validator-confirmed outcomes on passed demonstrations.
            </p>

            {/* PO / PSO roll-up */}
            {(attainment.data.po.length > 0 || attainment.data.pso.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { title: 'Programme Outcomes', rows: attainment.data.po },
                  { title: 'Programme Specific Outcomes', rows: attainment.data.pso },
                ]
                  .filter((g) => g.rows.length > 0)
                  .map((group) => (
                    <div key={group.title} className="border rounded-md p-3">
                      <h3 className="text-sm font-semibold mb-2">{group.title}</h3>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Outcome</TableHead>
                            <TableHead className="text-right">Attainment</TableHead>
                            <TableHead className="text-right">CLOs</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.rows.map((row) => (
                            <TableRow key={row.outcome_key}>
                              <TableCell className="font-medium">{row.outcome_key}</TableCell>
                              <TableCell className="text-right font-semibold">
                                {row.attainment_pct !== null ? `${row.attainment_pct}%` : '—'}
                              </TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">
                                {row.contributing_clos}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
              </div>
            )}

            {/* Per-syllabus-version CLO sections */}
            <div className="space-y-3">
              {attainment.data.syllabi.map((syl) => (
                <div key={syl.syllabus_id} className="border rounded-md p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium">
                      {syl.course_name}{' '}
                      <span className="text-xs text-muted-foreground font-mono">
                        {syl.course_code} · v{syl.version_number}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {syl.participating_learners} participating learner
                      {syl.participating_learners === 1 ? '' : 's'}
                    </span>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>CLO</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Attained</TableHead>
                        <TableHead className="text-right">Attainment</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {syl.clos.map((clo) => (
                        <TableRow key={clo.clo_number}>
                          <TableCell className="font-medium">CLO {clo.clo_number}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-md">
                            {clo.description}
                          </TableCell>
                          <TableCell className="text-right">
                            {clo.attained_learners}/{clo.participating_learners}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {clo.attainment_pct !== null ? `${clo.attainment_pct}%` : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">
            No demonstrations linked to BoS syllabi yet. Attainment appears here once
            learners tag course outcomes and validators confirm them.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function AccreditationEvidencePage({
  params,
}: {
  params: Promise<{ body: string }>;
}) {
  const { body: bodyParam } = use(params);
  const body = bodyParam.toUpperCase() as AccreditationBodyCode;

  // Unknown body → 404 so we don't render empty pages for typos.
  if (!SUPPORTED_BODIES.includes(body)) {
    notFound();
  }

  // T4.5 (2026-05-19): every supported body renders the PDE demonstrations
  // evidence section. NAAC additionally renders the legacy engagement / OBE /
  // Fink's / agency / innovation cards that the page already had.
  const renderLegacyNAAC = NAAC_RICH_LEGACY_BODIES.includes(body);

  return (
    <ContentLayout title={`${body} Evidence Report`}>
      <PageBreadcrumb items={[
        { label: 'Admin', href: '/admin' },
        { label: 'PDE', href: '/pde/admin/assessments' },
        { label: `${body} Evidence` },
      ]} />
      <div className="space-y-6 p-4">
        <div>
          <h1 className="text-2xl font-bold">{body} Evidence Report</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-generated evidence from the Principal Development Engine.
            {!renderLegacyNAAC && (
              <>
                {' '}
                Body-specific criterion mapping lands in the{' '}
                <Link
                  className="underline"
                  href={`/accreditation/${body.toLowerCase()}`}
                >
                  {body} dashboard
                </Link>
                .
              </>
            )}
          </p>
        </div>

        {/* T4.5 — PDE demonstrations evidence (every body). */}
        <PDEDemonstrationsEvidenceSection body={body} />

        {/* Curriculum connector — CLO/PO attainment from validated evidence. */}
        <CLOPOAttainmentSection />

        {/* Legacy NAAC-only content: engagement / OBE / Fink's / agency / innovation. */}
        {renderLegacyNAAC && <NAACEvidenceContent />}

        {!renderLegacyNAAC && (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                Body-specific criterion mapping not yet wired
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>
                The 7-category PDE evidence above is shared across every
                accreditation body. The {body}-specific criterion grouping
                (e.g. NBA criteria, NIRF parameters) lands in the per-body
                dashboard PR. For now, use the evidence card above as the raw
                attestation feed.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}

function NAACEvidenceContent() {
  const engagement = useNAACEngagement();
  const obe = useNAACOBE();
  const finks = useNAACFinks();
  const agency = useNAACAgency();
  const innovation = useNAACInnovation();

  // T4.5: this block is now rendered INSIDE the outer ContentLayout above
  // (only when body === 'NAAC'). We no longer wrap with our own
  // ContentLayout / breadcrumb / hero — those live in the routing component.
  return (
    <>
      {/* Original body — untouched from pre-PR-A4 */}
      <div className="space-y-6">
        {/* OBE */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><GraduationCap className="w-5 h-5 text-emerald-600" /> OBE Attainment</CardTitle>
            <Button variant="outline" size="sm" onClick={() => obe.data && downloadCSV(obe.data as any, 'naac-obe.csv')} disabled={!obe.data?.length}><Download className="w-4 h-4 mr-1" /> CSV</Button>
          </CardHeader>
          <CardContent>
            {obe.isLoading ? <Skeleton className="h-40 w-full" /> : !(obe.data || []).length ? (
              <p className="text-sm text-gray-500 italic">No capability data yet.</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Capability</TableHead><TableHead>Category</TableHead><TableHead>Level</TableHead><TableHead className="text-right">Demonstrated</TableHead><TableHead className="text-right">Enrolled</TableHead><TableHead className="text-right">Attainment %</TableHead></TableRow></TableHeader>
                <TableBody>{(obe.data || []).map((r, i) => (
                  <TableRow key={i}><TableCell className="font-medium">{r.capability_name}</TableCell><TableCell><Badge variant="outline" className="capitalize text-xs">{r.category.replace(/_/g, ' ')}</Badge></TableCell><TableCell>L{r.level}</TableCell><TableCell className="text-right">{r.demonstrated_count}</TableCell><TableCell className="text-right">{r.total_enrolled}</TableCell><TableCell className="text-right font-semibold"><span className={r.attainment_pct >= 60 ? 'text-emerald-600' : r.attainment_pct >= 30 ? 'text-amber-600' : 'text-red-600'}>{r.attainment_pct}%</span></TableCell></TableRow>
                ))}</TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Engagement */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Activity className="w-5 h-5 text-blue-600" /> Engagement Metrics</CardTitle>
            <Button variant="outline" size="sm" onClick={() => engagement.data && downloadCSV([engagement.data as any], 'naac-engagement.csv')} disabled={!engagement.data}><Download className="w-4 h-4 mr-1" /> CSV</Button>
          </CardHeader>
          <CardContent>
            {engagement.isLoading ? <Skeleton className="h-24 w-full" /> : engagement.data ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard label="Quest Enrollments" value={engagement.data.totalEnrollments} />
                <MetricCard label="Completion Rate" value={`${engagement.data.completionRate}%`} />
                <MetricCard label="Assessment Pass Rate" value={`${engagement.data.assessmentPassRate}%`} />
                <MetricCard label="Avg Time on Task" value={`${engagement.data.avgTimeOnTask} min/day`} />
                <MetricCard label="Total Submissions" value={engagement.data.totalSubmissions} />
                <MetricCard label="Passed Submissions" value={engagement.data.passedSubmissions} />
                <MetricCard label="Certificates Issued" value={engagement.data.certificatesIssued} />
              </div>
            ) : <p className="text-sm text-gray-500 italic">No data yet.</p>}
          </CardContent>
        </Card>

        {/* Finks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="w-5 h-5 text-purple-600" /> Competency Distribution (Fink&apos;s)</CardTitle>
            <Button variant="outline" size="sm" onClick={() => finks.data && downloadCSV(Object.entries(finks.data).map(([d, s]) => ({ dimension: FINKS_LABELS[d] || d, ...s })), 'naac-finks.csv')} disabled={!finks.data}><Download className="w-4 h-4 mr-1" /> CSV</Button>
          </CardHeader>
          <CardContent>
            {finks.isLoading ? <Skeleton className="h-32 w-full" /> : finks.data ? (
              <Table>
                <TableHeader><TableRow><TableHead>Dimension</TableHead><TableHead className="text-right">Average</TableHead><TableHead className="text-right">Count</TableHead><TableHead className="text-right">Min</TableHead><TableHead className="text-right">Max</TableHead></TableRow></TableHeader>
                <TableBody>{Object.entries(finks.data).map(([dim, s]) => (
                  <TableRow key={dim}><TableCell className="font-medium">{FINKS_LABELS[dim] || dim}</TableCell><TableCell className="text-right font-semibold">{s.avg}</TableCell><TableCell className="text-right">{s.count}</TableCell><TableCell className="text-right text-muted-foreground">{s.min}</TableCell><TableCell className="text-right text-muted-foreground">{s.max}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            ) : <p className="text-sm text-gray-500 italic">No data yet.</p>}
          </CardContent>
        </Card>

        {/* Agency */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="w-5 h-5 text-amber-600" /> Placement Readiness</CardTitle>
            <Button variant="outline" size="sm" onClick={() => agency.data && downloadCSV(Object.entries(agency.data.distribution).map(([l, c]) => ({ level: AGENCY_LABELS[l] || l, count: c, pct: agency.data!.total ? Math.round((c / agency.data!.total) * 100) : 0 })), 'naac-agency.csv')} disabled={!agency.data}><Download className="w-4 h-4 mr-1" /> CSV</Button>
          </CardHeader>
          <CardContent>
            {agency.isLoading ? <Skeleton className="h-32 w-full" /> : agency.data && agency.data.total > 0 ? (
              <div>
                <p className="text-sm text-muted-foreground mb-4">{agency.data.total} Learners assessed</p>
                <div className="grid grid-cols-5 gap-3">
                  {Object.entries(agency.data.distribution).map(([level, count]) => (
                    <div key={level} className="text-center p-3 rounded-lg bg-muted/50">
                      <div className="text-2xl font-bold">{count}</div>
                      <div className="text-xs text-muted-foreground capitalize mt-1">{AGENCY_LABELS[level] || level}</div>
                      <div className="text-xs font-semibold text-muted-foreground">{agency.data!.total > 0 ? Math.round((count / agency.data!.total) * 100) : 0}%</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="text-sm text-gray-500 italic">No agency data yet.</p>}
          </CardContent>
        </Card>

        {/* Innovation */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="w-5 h-5 text-yellow-600" /> Innovation Metrics</CardTitle>
            <Button variant="outline" size="sm" onClick={() => innovation.data && downloadCSV([innovation.data as any], 'naac-innovation.csv')} disabled={!innovation.data}><Download className="w-4 h-4 mr-1" /> CSV</Button>
          </CardHeader>
          <CardContent>
            {innovation.isLoading ? <Skeleton className="h-24 w-full" /> : innovation.data ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard label="Quests Completed" value={innovation.data.questsCompleted} />
                <MetricCard label="Solutions Deployed" value={innovation.data.solutionsDeployed} />
                <MetricCard label="NIF Submissions" value={innovation.data.nifSubmissions} />
                <MetricCard label="Peer Reviews" value={innovation.data.peerReviews} />
              </div>
            ) : <p className="text-sm text-gray-500 italic">No data yet.</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
