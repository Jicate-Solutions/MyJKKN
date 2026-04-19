// app/(routes)/accreditation/inc/page.tsx
// ============================================================================
// PR-A14 — INC Dashboard (Unification Program 14/15)
//
// INC (Indian Nursing Council) conducts annual inspections under INC Regulations
// 2021. At JKKN, INC applies ONLY to JKKN College of Nursing — so this dashboard
// is fixed-scope (no college switcher) and auto-resolves the nursing institution
// via iqac_code='NURS' with a name-based fallback.
//
// 6 INC inspection categories rendered as drill-down cards:
//   1. Intake & Admission   (approved intake, filled seats, NEET compliance)
//   2. Faculty              (INC-registered, clinical nurse educators, PG-qual)
//   3. Clinical Exposure    (parent hospital, bed strength, posting logs)
//   4. Infrastructure       (fundamentals / community / computer labs, library)
//   5. Curriculum Delivery  (theory + clinical hrs per INC syllabus)
//   6. Research & Pubs      (faculty publications, M.Sc dissertations)
//
// Reuses PR-A2 substrate (sh_accreditation_metrics, quality_evidence_mappings)
// and PR-A7 body metadata (ACCREDITATION_BODIES).
// ============================================================================

'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Stethoscope,
  Users,
  BookOpen,
  Building2,
  GraduationCap,
  Microscope,
  ClipboardCheck,
  BarChart3,
  AlertTriangle,
  Heart,
} from 'lucide-react';
import { ACCREDITATION_BODIES } from '@/lib/types/accreditation';
import {
  useNursingInstitution,
  useINCMetrics,
  useINCEvidenceCounts,
  type INCMetric,
} from '@/hooks/accreditation/use-inc-dashboard';

// ----------------------------------------------------------------------------
// INC inspection categories (simplified from INC Regulations 2021).
// The `matchCategories` array maps each card to the `category` values that may
// appear on INC-seeded rows of sh_accreditation_metrics. We match by lowercase
// substring to stay resilient as PR-A2 seeds expand (currently 'Faculty',
// 'Training' live; more land with future catalog seed PRs).
// ----------------------------------------------------------------------------
interface CategoryMeta {
  key: string;
  name: string;
  shortLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  matchCategories: string[];
}

const INC_CATEGORIES: CategoryMeta[] = [
  {
    key: 'intake',
    name: 'Intake & Admission',
    shortLabel: 'Intake & Admission',
    description:
      'Approved intake per program, filled seats, NEET eligibility compliance across B.Sc Nursing, M.Sc Nursing, Post-Basic B.Sc.',
    icon: ClipboardCheck,
    accent: 'text-lime-600',
    matchCategories: ['intake', 'admission'],
  },
  {
    key: 'faculty',
    name: 'Faculty',
    shortLabel: 'Faculty',
    description:
      'INC-registered faculty roster, clinical nurse educators, PG-qualified tutor ratios (1:10 theory / 1:5 clinical per INC norms).',
    icon: Users,
    accent: 'text-emerald-600',
    matchCategories: ['faculty'],
  },
  {
    key: 'clinical',
    name: 'Clinical Exposure',
    shortLabel: 'Clinical Exposure',
    description:
      'Parent hospital affiliation, bed strength, clinical posting logs across medical / surgical / OBG / paeds / community / mental health.',
    icon: Heart,
    accent: 'text-rose-600',
    matchCategories: ['training', 'clinical'],
  },
  {
    key: 'infrastructure',
    name: 'Infrastructure',
    shortLabel: 'Infrastructure',
    description:
      'Fundamentals of nursing lab, community health lab, computer lab, nursing library (journals, bed-side reference).',
    icon: Building2,
    accent: 'text-sky-600',
    matchCategories: ['infrastructure', 'facilities'],
  },
  {
    key: 'curriculum',
    name: 'Curriculum Delivery',
    shortLabel: 'Curriculum Delivery',
    description:
      'Theory + clinical hours per INC syllabus, assignments, internal / external evaluations, skill log books.',
    icon: BookOpen,
    accent: 'text-indigo-600',
    matchCategories: ['curriculum', 'delivery', 'teaching'],
  },
  {
    key: 'research',
    name: 'Research & Publications',
    shortLabel: 'Research & Pubs',
    description:
      'Faculty publication count, M.Sc Nursing dissertations, access to nursing journals, research guide registrations.',
    icon: Microscope,
    accent: 'text-purple-600',
    matchCategories: ['research', 'publication'],
  },
];

const INC_PROGRAMS = [
  'B.Sc Nursing (4 yr)',
  'M.Sc Nursing (2 yr)',
  'Post-Basic B.Sc Nursing (2 yr)',
  'GNM (3 yr, if provisioned)',
];

// ----------------------------------------------------------------------------
// Helper: match a metric row to a category card by category substring.
// ----------------------------------------------------------------------------
function categorize(metrics: INCMetric[]): Record<string, INCMetric[]> {
  const buckets: Record<string, INCMetric[]> = {};
  for (const cat of INC_CATEGORIES) buckets[cat.key] = [];
  buckets.other = [];

  for (const m of metrics) {
    const cat = (m.category ?? '').toLowerCase();
    let placed = false;
    for (const cardCat of INC_CATEGORIES) {
      if (cardCat.matchCategories.some((kw) => cat.includes(kw))) {
        buckets[cardCat.key]!.push(m);
        placed = true;
        break;
      }
    }
    if (!placed) buckets.other!.push(m);
  }
  return buckets;
}

// ----------------------------------------------------------------------------
// Page component
// ----------------------------------------------------------------------------
export default function INCDashboardPage() {
  const incMeta = ACCREDITATION_BODIES.find((b) => b.code === 'INC')!;

  const { data: institution, isLoading: instLoading } = useNursingInstitution();
  const { data: metrics = [], isLoading: metricsLoading } = useINCMetrics();
  const { data: evidenceCounts = {}, isLoading: evidenceLoading } =
    useINCEvidenceCounts(institution?.id ?? null);

  const metricsByCategory = categorize(metrics);

  const totalMetrics = metrics.length;
  const totalMaxScore = metrics.reduce((s, m) => s + (m.max_score ?? 0), 0);
  const totalEvidence = Object.values(evidenceCounts).reduce((s, n) => s + n, 0);

  return (
    <ContentLayout title="INC — Indian Nursing Council">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'INC', href: '/accreditation/inc' },
        ]}
      />

      <div className="space-y-6">
        {/* Header card — fixed scope (JKKN College of Nursing) */}
        <Card className={`border-2 ${incMeta.accentClass}`}>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Stethoscope className="h-7 w-7 text-lime-600" />
                  INC — {institution?.name ?? 'JKKN College of Nursing'}
                </CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">
                  Indian Nursing Council annual inspection. INC Regulations 2021
                  govern nursing education — intake, faculty registration,
                  clinical exposure, infrastructure, curriculum delivery, and
                  research outputs. Scope is fixed: JKKN College of Nursing only.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-xs">
                    <GraduationCap className="mr-1 h-3 w-3" />
                    {institution?.iqac_code ?? 'NURS'}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {incMeta.cycleLabel}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    Single-institution scope
                  </Badge>
                </div>
              </div>
            </div>
          </CardHeader>

          {/* Stat strip */}
          <CardContent>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Metrics seeded</div>
                <div className="text-2xl font-bold">
                  {metricsLoading ? '—' : totalMetrics}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Max score tracked: {metricsLoading ? '—' : totalMaxScore}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Evidence rows</div>
                <div className="text-2xl font-bold">
                  {evidenceLoading || instLoading ? '—' : totalEvidence}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Nursing college scope
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Cycle</div>
                <div className="text-lg font-semibold">Annual inspection</div>
                <div className="text-[10px] text-muted-foreground">
                  INC Regulations 2021
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Programs</div>
                <div className="text-lg font-semibold">{INC_PROGRAMS.length}</div>
                <div className="text-[10px] text-muted-foreground">
                  B.Sc / M.Sc / PB B.Sc / GNM
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/accreditation/coverage">
                <Button variant="outline" size="sm">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Coverage matrix
                </Button>
              </Link>
              <Button variant="outline" size="sm" disabled title="Lands post-unification">
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Inspection calendar (soon)
              </Button>
              <Button variant="outline" size="sm" disabled title="Lands post-unification">
                <Users className="mr-2 h-4 w-4" />
                INC faculty roster export (soon)
              </Button>
            </div>

            {/* No-institution warning */}
            {!instLoading && !institution && (
              <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-xs">
                  <span className="font-semibold">Nursing college not resolved.</span>{' '}
                  No institution matches <code>iqac_code=&apos;NURS&apos;</code> or
                  name-contains-&apos;Nursing&apos;. Wire IQAC code on the
                  nursing college to enable evidence scoping.
                </p>
              </div>
            )}

            {/* Program chips */}
            <div className="mt-4">
              <div className="mb-1 text-xs font-medium text-muted-foreground">
                INC-approved programs at JKKN:
              </div>
              <div className="flex flex-wrap gap-2">
                {INC_PROGRAMS.map((p) => (
                  <Badge key={p} variant="secondary" className="text-[11px]">
                    <GraduationCap className="mr-1 h-3 w-3" />
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 6 category cards */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {INC_CATEGORIES.map((cat) => {
            const metricList = metricsByCategory[cat.key] ?? [];
            const catMaxScore = metricList.reduce((s, m) => s + (m.max_score ?? 0), 0);
            const catEvidence = metricList.reduce(
              (s, m) => s + (evidenceCounts[m.metric_code] ?? 0),
              0,
            );
            const Icon = cat.icon;
            return (
              <Card key={cat.key} className="h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className={`h-5 w-5 ${cat.accent}`} />
                      <span>{cat.shortLabel}</span>
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px]">
                      {metricList.length} metric{metricList.length === 1 ? '' : 's'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug">
                    {cat.description}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Max score</div>
                      <div className="text-lg font-semibold">
                        {catMaxScore || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Evidence</div>
                      <div className="text-lg font-semibold">{catEvidence}</div>
                    </div>
                  </div>
                  {metricList.length > 0 ? (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        View {metricList.length} metric{metricList.length === 1 ? '' : 's'}
                      </summary>
                      <ul className="mt-2 space-y-1 pl-2">
                        {metricList.map((m) => (
                          <li
                            key={m.metric_code}
                            className="flex items-start justify-between gap-2"
                          >
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {m.metric_code}
                            </span>
                            <span className="flex-1 text-[11px]">{m.metric_name}</span>
                            <Badge variant="secondary" className="text-[9px]">
                              {evidenceCounts[m.metric_code] ?? 0}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    <p className="text-[11px] italic text-muted-foreground">
                      No metrics seeded yet — seeding lands in a future INC
                      catalog-expansion PR.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Uncategorised metrics (fail-safe if a future seed uses a new category) */}
        {metricsByCategory.other && metricsByCategory.other.length > 0 && (
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">
                Other INC metrics ({metricsByCategory.other.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-xs">
                {metricsByCategory.other.map((m) => (
                  <li key={m.metric_code} className="flex items-start justify-between gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {m.metric_code}
                    </span>
                    <span className="flex-1">{m.metric_name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {m.category ?? 'uncategorised'}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <Card className="bg-muted/30">
          <CardContent className="pt-6 text-xs text-muted-foreground space-y-2">
            <p>
              <strong>Scope is fixed:</strong> INC inspections apply only to
              JKKN College of Nursing. This dashboard does not expose a college
              switcher — the nursing college is auto-resolved by{' '}
              <code>iqac_code=&apos;NURS&apos;</code>.
            </p>
            <p>
              <strong>Coverage formula (placeholder):</strong>{' '}
              <code>evidence_rows / metrics_seeded</code>. The real INC
              inspection scoring rubric (INC Regulations 2021) lands when the
              full INC catalog is seeded in a later PR alongside the fan-out
              triggers from faculty, clinical placement, and curriculum modules.
            </p>
            <p>
              Evidence rows are emitted by triggers once source modules are
              retrofitted: HR faculty registration → FAC, clinical placements →
              CLN, curriculum delivery logs → Curriculum, M.Sc dissertations →
              Research.
            </p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
