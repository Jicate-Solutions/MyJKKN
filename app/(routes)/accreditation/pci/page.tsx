// app/(routes)/accreditation/pci/page.tsx
// ============================================================================
// PR-A13 — PCI (Pharmacy Council of India) Dashboard
// Compliance Unification Program 13/15
//
// PCI regulates pharmacy education in India. At JKKN, PCI applies ONLY to
// JKKN College of Pharmacy. The institution is auto-detected (iqac_code='PHAR'
// OR name ILIKE '%pharmacy%') — there is no college switcher.
//
// PCI Regulations 2020 cover 4 program levels:
//   D.Pharm (2-yr diploma)
//   B.Pharm (4-yr UG)
//   Pharm.D (6-yr doctoral clinical)
//   M.Pharm (2-yr PG)
//
// Dashboard surfaces 6 inspection categories:
//   1. Course Approval & Intake
//   2. Faculty
//   3. Infrastructure (labs, machine room, animal house)
//   4. Hospital Affiliation (Pharm.D)
//   5. Research
//   6. Pharmacy Practice
//
// Data sourced from PR-A2 substrate:
//   - sh_accreditation_metrics (metric_type='PCI')
//   - quality_evidence_mappings (body_code='PCI', institution_id=<pharmacy>)
// ============================================================================

'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Pill,
  BarChart3,
  BookOpen,
  Users,
  Building2,
  Hospital,
  Microscope,
  Stethoscope,
  AlertTriangle,
} from 'lucide-react';
import { ACCREDITATION_BODIES } from '@/lib/types/accreditation';
import {
  usePharmacyInstitution,
  usePCIMetrics,
  usePCIEvidenceCounts,
  type PCIMetric,
} from '@/hooks/accreditation/use-pci-dashboard';

// ----------------------------------------------------------------------------
// The 6 PCI inspection categories — drives the card grid. The `keys` array
// lists substring matches against `category` on sh_accreditation_metrics.
// Metrics with no category match fall into `Other`.
// ----------------------------------------------------------------------------
interface CategoryMeta {
  key: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  matchTokens: string[];
}

const PCI_CATEGORIES: CategoryMeta[] = [
  {
    key: 'approval',
    name: 'Course Approval & Intake',
    description: 'Annual approved intake per program + filled seats',
    icon: BookOpen,
    accent: 'text-indigo-600',
    matchTokens: ['approval', 'intake', 'course', 'admission'],
  },
  {
    key: 'faculty',
    name: 'Faculty',
    description: 'PCI-registered faculty, PG qualification, staff:student ratios',
    icon: Users,
    accent: 'text-blue-600',
    matchTokens: ['faculty', 'staff', 'teacher'],
  },
  {
    key: 'infrastructure',
    name: 'Infrastructure',
    description: 'Pharmaceutics, Pharm Chem, Pharmacology, Pharmacognosy labs + animal house',
    icon: Building2,
    accent: 'text-sky-600',
    matchTokens: ['infrastructure', 'lab', 'building', 'facility', 'animal'],
  },
  {
    key: 'hospital',
    name: 'Hospital Affiliation',
    description: 'Pharm.D — partnered teaching hospital, patient load access',
    icon: Hospital,
    accent: 'text-rose-600',
    matchTokens: ['hospital', 'affiliation', 'clinical-posting'],
  },
  {
    key: 'research',
    name: 'Research',
    description: 'Publications, patents, M.Pharm / Pharm.D thesis',
    icon: Microscope,
    accent: 'text-purple-600',
    matchTokens: ['research', 'publication', 'patent', 'thesis'],
  },
  {
    key: 'practice',
    name: 'Pharmacy Practice',
    description: 'Drug information centre, clinical pharmacy services, patient counselling logs',
    icon: Stethoscope,
    accent: 'text-emerald-600',
    matchTokens: ['practice', 'drug-information', 'counselling', 'dispensing', 'clinical'],
  },
];

// Program levels tracked under PCI — shown as tags on the stat strip.
const PCI_PROGRAMS = ['D.Pharm', 'B.Pharm', 'Pharm.D', 'M.Pharm'];

function categoriseMetric(metric: PCIMetric): string {
  const haystack = `${metric.category ?? ''} ${metric.metric_code} ${metric.metric_name}`.toLowerCase();
  for (const cat of PCI_CATEGORIES) {
    if (cat.matchTokens.some((tok) => haystack.includes(tok))) return cat.key;
  }
  return 'other';
}

// ----------------------------------------------------------------------------
// Page component
// ----------------------------------------------------------------------------
export default function PCIDashboardPage() {
  const { data: institution, isLoading: instLoading } = usePharmacyInstitution();
  const { data: metrics, isLoading: metricsLoading } = usePCIMetrics();
  const { data: evidenceCounts, isLoading: evidenceLoading } = usePCIEvidenceCounts(
    institution?.id ?? null,
  );

  const pciMeta = ACCREDITATION_BODIES.find((b) => b.code === 'PCI')!;

  // Group metrics by category using token matching on `category`.
  const metricsByCategory = (metrics ?? []).reduce<Record<string, PCIMetric[]>>((acc, m) => {
    const key = categoriseMetric(m);
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(m);
    return acc;
  }, {});

  const totalMetrics = (metrics ?? []).length;
  const totalEvidence = Object.values(evidenceCounts ?? {}).reduce((s, n) => s + n, 0);
  const uncategorisedCount = (metricsByCategory['other'] ?? []).length;

  return (
    <ContentLayout title="PCI — JKKN College of Pharmacy">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'PCI', href: '/accreditation/pci' },
        ]}
      />

      <div className="space-y-6">
        {/* Header card */}
        <Card className={`border-2 ${pciMeta.accentClass}`}>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Pill className="h-7 w-7 text-violet-600" />
                  PCI — JKKN College of Pharmacy
                </CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">
                  Pharmacy Council of India — annual inspection regulator under
                  PCI Regulations 2020. Scoped to JKKN College of Pharmacy only
                  (single institution). Covers D.Pharm, B.Pharm, Pharm.D, and
                  M.Pharm program levels.
                </p>
              </div>

              {/* Fixed-scope indicator — no switcher for PCI */}
              <div className="min-w-[240px] rounded-md border bg-card p-3">
                <div className="text-xs text-muted-foreground">Scope (fixed)</div>
                <div className="mt-1 text-sm font-semibold">
                  {instLoading
                    ? 'Resolving…'
                    : institution
                      ? `${institution.iqac_code ? `[${institution.iqac_code}] ` : ''}${institution.name}`
                      : 'Pharmacy college not found'}
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
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Evidence rows</div>
                <div className="text-2xl font-bold">
                  {evidenceLoading ? '—' : totalEvidence}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Cycle</div>
                <div className="text-lg font-semibold">Annual inspection</div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Programs</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {PCI_PROGRAMS.map((p) => (
                    <Badge key={p} variant="outline" className="text-[10px]">
                      {p}
                    </Badge>
                  ))}
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
              <Button variant="outline" size="sm" disabled title="Lands in a later PR">
                <BookOpen className="mr-2 h-4 w-4" />
                SIF export (soon)
              </Button>
              <Button variant="outline" size="sm" disabled title="Lands in a later PR">
                <Hospital className="mr-2 h-4 w-4" />
                Hospital affiliation docs (soon)
              </Button>
            </div>

            {/* No-institution warning */}
            {!instLoading && !institution && (
              <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-xs">
                  No pharmacy institution matched <code>iqac_code = &apos;PHAR&apos;</code> or{' '}
                  <code>name ILIKE &apos;%pharmacy%&apos;</code>. Evidence counts will
                  stay at zero until the pharmacy college is tagged in the{' '}
                  <code>institutions</code> table.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 6 category cards */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PCI_CATEGORIES.map((cat) => {
            const metricList = metricsByCategory[cat.key] ?? [];
            const catMaxScore = metricList.reduce((s, m) => s + (m.max_score ?? 0), 0);
            const catEvidence = metricList.reduce(
              (s, m) => s + (evidenceCounts?.[m.metric_code] ?? 0),
              0,
            );
            const Icon = cat.icon;
            return (
              <Card key={cat.key} className="h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className={`h-5 w-5 ${cat.accent}`} />
                      <span>{cat.name}</span>
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px]">
                      {metricList.length} metric{metricList.length === 1 ? '' : 's'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{cat.description}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Max score</div>
                      <div className="text-lg font-semibold">{catMaxScore || '—'}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Evidence</div>
                      <div className="text-lg font-semibold">{catEvidence}</div>
                    </div>
                  </div>
                  {metricList.length > 0 && (
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
                              {evidenceCounts?.[m.metric_code] ?? 0}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Uncategorised metric bucket — only shown if any PCI metric didn't
            match the 6 category tokens. Useful signal during seeding. */}
        {uncategorisedCount > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Uncategorised PCI metrics</CardTitle>
              <p className="text-xs text-muted-foreground">
                Metrics whose <code>category</code> did not match any of the 6 PCI
                inspection buckets. Re-tag at source or extend{' '}
                <code>PCI_CATEGORIES[].matchTokens</code>.
              </p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-xs">
                {(metricsByCategory['other'] ?? []).map((m) => (
                  <li key={m.metric_code} className="flex items-start justify-between gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {m.metric_code}
                    </span>
                    <span className="flex-1">{m.metric_name}</span>
                    <Badge variant="secondary" className="text-[9px]">
                      {evidenceCounts?.[m.metric_code] ?? 0}
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
              <strong>Scope lock:</strong> PCI regulates pharmacy education only.
              JKKN has exactly one pharmacy institution (JKKN College of Pharmacy)
              — hence no college switcher on this dashboard. The pharmacy
              institution is auto-resolved via <code>iqac_code = &apos;PHAR&apos;</code>{' '}
              (primary) or <code>name ILIKE &apos;%pharmacy%&apos;</code> (fallback).
            </p>
            <p>
              <strong>Coverage formula (placeholder):</strong> evidence_rows /
              metrics_seeded. The real PCI 2020 weighted rubric (deficiency
              count + intake reduction rules) lands in a follow-up PR once the
              full PCI catalog is seeded against docs/one-jkkn-one-data.md §8.
            </p>
            <p>
              Evidence rows are auto-emitted by fan-out triggers. Hospital
              affiliation and drug information centre logs will wire up as each
              source module is retrofitted under the Compliance Unification
              program.
            </p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
