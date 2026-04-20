// app/(routes)/accreditation/dci/page.tsx
// ============================================================================
// PR-A12 — DCI (Dental Council of India) dashboard (Unification 12/15)
//
// DCI conducts ANNUAL inspections of dental colleges. At JKKN, DCI applies
// ONLY to JKKN Dental College (single institution — no cluster switcher).
// The dental institution is auto-detected via `iqac_code='DENT'` with an
// `ILIKE '%dental%'` name fallback.
//
// Reads PR-A2 substrate:
//   - `sh_accreditation_metrics` filtered `metric_type='DCI'`
//   - `quality_evidence_mappings` filtered `body_code='DCI' AND institution_id=<dental>`
//
// Shared infrastructure (PR-A7):
//   - ACCREDITATION_BODIES[DCI] for header metadata + accent
//
// Replaces the PR-A8 c2 stub that used BodyPlaceholderPage.
// ============================================================================

'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Stethoscope,
  Building2,
  Users,
  HeartPulse,
  ClipboardList,
  Microscope,
  ShieldAlert,
} from 'lucide-react';
import { ACCREDITATION_BODIES } from '@/lib/types/accreditation';
import {
  useDentalInstitution,
  useDCIMetrics,
  useDCIEvidenceCounts,
  type DCIMetric,
} from '@/hooks/accreditation/use-dci-dashboard';

// ----------------------------------------------------------------------------
// DCI inspection categories. Metrics are mapped to categories by the
// `category` column on sh_accreditation_metrics. If the seeded catalog hasn't
// tagged a metric to one of these, it lands in "Other".
// Keys are matched case-insensitively against metric.category.
// ----------------------------------------------------------------------------
interface CategoryMeta {
  key: string;
  name: string;
  shortLabel: string;
  description: string;
  matchers: string[]; // lowercased substrings to match metric.category
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}

const DCI_CATEGORIES: CategoryMeta[] = [
  {
    key: 'infrastructure',
    name: 'Infrastructure',
    shortLabel: 'Infrastructure',
    description:
      'Classrooms, library, chair count, lab equipment, pre-clinical departments per DCI norms.',
    matchers: ['infrastructure', 'infra', 'facilities'],
    icon: Building2,
    accent: 'text-sky-600',
  },
  {
    key: 'faculty',
    name: 'Faculty',
    shortLabel: 'Faculty',
    description:
      'DCI-registered faculty (registration numbers), PG qualification ratios, professor:learner ratios.',
    matchers: ['faculty', 'staff', 'teacher'],
    icon: Users,
    accent: 'text-blue-600',
  },
  {
    key: 'patient-load',
    name: 'Patient Load',
    shortLabel: 'Patient Load',
    description:
      'OPD footfall, IPD admissions per month, procedure logs (extractions, restorations, surgeries).',
    matchers: ['patient', 'opd', 'ipd', 'footfall'],
    icon: HeartPulse,
    accent: 'text-rose-600',
  },
  {
    key: 'clinical-exposure',
    name: 'Clinical Exposure',
    shortLabel: 'Clinical Exposure',
    description:
      'Case logs per learner (BDS Part-IV + MDS 3-yr), duty roster coverage, case-diversity diagnosis.',
    matchers: ['clinical', 'case', 'exposure', 'duty'],
    icon: ClipboardList,
    accent: 'text-fuchsia-600',
  },
  {
    key: 'research',
    name: 'Research & Publications',
    shortLabel: 'Research',
    description:
      'Faculty publications indexed (Scopus / PubMed), PG thesis depositions, CDE hours.',
    matchers: ['research', 'publication', 'thesis', 'cde'],
    icon: Microscope,
    accent: 'text-purple-600',
  },
  {
    key: 'ethics',
    name: 'Ethics & Compliance',
    shortLabel: 'Ethics',
    description:
      'PNDT cell, hazardous waste disposal logs, patient records compliance.',
    matchers: ['ethics', 'compliance', 'waste', 'pndt', 'record'],
    icon: ShieldAlert,
    accent: 'text-amber-600',
  },
];

function categoryFor(metric: DCIMetric): string {
  const raw = (metric.category ?? '').toLowerCase();
  if (!raw) return 'other';
  for (const cat of DCI_CATEGORIES) {
    if (cat.matchers.some((m) => raw.includes(m))) return cat.key;
  }
  return 'other';
}

// ----------------------------------------------------------------------------
// Page
// ----------------------------------------------------------------------------
export default function DCIDashboardPage() {
  const { data: dental, isLoading: dentalLoading } = useDentalInstitution();
  const { data: metrics, isLoading: metricsLoading } = useDCIMetrics();
  const { data: evidenceCounts, isLoading: evidenceLoading } = useDCIEvidenceCounts(
    dental?.id ?? null,
  );

  const dciMeta = ACCREDITATION_BODIES.find((b) => b.code === 'DCI')!;

  // Group metrics by category
  const metricsByCategory = (metrics ?? []).reduce<Record<string, DCIMetric[]>>((acc, m) => {
    const key = categoryFor(m);
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(m);
    return acc;
  }, {});

  const totalMetrics = (metrics ?? []).length;
  const totalEvidence = Object.values(evidenceCounts ?? {}).reduce((s, n) => s + n, 0);
  const totalMaxScore = (metrics ?? []).reduce((s, m) => s + (m.max_score ?? 0), 0);

  // Next inspection is stubbed — DCI doesn't publish a fixed calendar, each
  // college schedules on the approval anniversary. Replace with a real field
  // when the inspection calendar table is wired.
  const nextInspectionLabel = 'Annual (schedule TBD)';

  return (
    <ContentLayout title="DCI — JKKN Dental College">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'DCI', href: '/accreditation/dci' },
        ]}
      />

      <div className="space-y-6">
        {/* Header */}
        <Card className={`border-2 ${dciMeta.accentClass}`}>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Stethoscope className="h-7 w-7 text-fuchsia-600" />
                  DCI — JKKN Dental College
                </CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">
                  Dental Council of India — annual inspection regulator for
                  BDS + MDS programs. Scope at JKKN:{' '}
                  <span className="font-medium">JKKN Dental College only</span>.
                </p>
              </div>

              {/* Fixed scope — no switcher. Show the detected institution. */}
              <div className="min-w-[240px]">
                <div className="rounded-lg border bg-card px-3 py-2">
                  <div className="text-xs text-muted-foreground">Institution</div>
                  <div className="text-sm font-semibold">
                    {dentalLoading
                      ? '...'
                      : dental
                        ? `${dental.iqac_code ? `[${dental.iqac_code}] ` : ''}${dental.name}`
                        : 'Not found'}
                  </div>
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
                <div className="text-xs text-muted-foreground">Max score tracked</div>
                <div className="text-2xl font-bold">
                  {metricsLoading ? '—' : totalMaxScore || '—'}
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
                <div className="text-sm font-semibold">{dciMeta.cycleLabel}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  Next: {nextInspectionLabel}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Missing-institution guard */}
        {!dentalLoading && !dental && (
          <Card className="border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
            <CardContent className="pt-6">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <span className="font-semibold">JKKN Dental College not found.</span>{' '}
                No institution with <code>iqac_code=&apos;DENT&apos;</code> or a name
                matching <code>%dental%</code> is currently seeded. Evidence counts
                will be empty until the institution row exists.
              </p>
            </CardContent>
          </Card>
        )}

        {/* 6 category cards */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {DCI_CATEGORIES.map((cat) => {
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
                      <span>{cat.shortLabel}</span>
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px]">
                      {metricList.length} metric{metricList.length === 1 ? '' : 's'}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium">{cat.name}</p>
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
                        {metricList.length} metric{metricList.length === 1 ? '' : 's'}
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
                  {metricList.length === 0 && !metricsLoading && (
                    <p className="text-[11px] italic text-muted-foreground">
                      No metrics tagged to this category yet. Seed DCI catalog rows
                      with <code>category</code> matching keywords:{' '}
                      {cat.matchers.map((m) => `"${m}"`).join(', ')}.
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
              <strong>Scope lock:</strong> DCI applies only to JKKN Dental
              College. No cluster switcher is exposed — evidence queries are
              hard-scoped to the detected dental institution_id.
            </p>
            <p>
              <strong>Category mapping:</strong> Metrics are bucketed by
              substring match on the seeded <code>category</code> column
              (case-insensitive). Uncategorised metrics are intentionally
              hidden from the 6 cards above until the catalog is retagged.
            </p>
            <p>
              <strong>Coverage formula (placeholder):</strong> evidence_rows /
              metrics_seeded. Real DCI weighted formula lands when the full DCI
              catalog is reviewed alongside PCI + INC in a later unification PR.
            </p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
