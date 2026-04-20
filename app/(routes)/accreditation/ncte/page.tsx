// app/(routes)/accreditation/ncte/page.tsx
// ============================================================================
// PR-A15 — NCTE Dashboard (Unification Program, 15/15)
//
// National Council for Teacher Education — applies to JKKN College of
// Education only (auto-detected by iqac_code='EDUC' OR name ILIKE '%education%').
// Tracks 5 compliance domains: Recognition, Intake, Infrastructure,
// Curriculum Transaction, Evaluation.
//
// Replaces the PR-A8 c2 BodyPlaceholderPage stub.
// ============================================================================

'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  GraduationCap,
  BarChart3,
  FileCheck,
  Users,
  Building2,
  BookOpen,
  ClipboardCheck,
  School,
} from 'lucide-react';
import { ACCREDITATION_BODIES } from '@/lib/types/accreditation';
import {
  useBodyMetrics,
  useBodyEvidenceCounts,
  useJKKNInstitutions,
} from '@/hooks/accreditation/use-body-dashboard';
import type { BodyMetricRow } from '@/hooks/accreditation/use-body-dashboard';

// ----------------------------------------------------------------------------
// NCTE compliance domains — 5 categories per NCTE Regulations 2014/2021.
// ----------------------------------------------------------------------------
interface NCTEDomain {
  key: string;
  name: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  description: string;
  // Metric codes prefix or keywords that map to this domain
  codeHints: string[];
}

const NCTE_DOMAINS: NCTEDomain[] = [
  {
    key: 'recognition',
    name: 'Recognition Status',
    shortLabel: 'Recognition',
    icon: FileCheck,
    accent: 'text-teal-600',
    description: 'NCTE approval orders, course-wise recognition, renewal dates, NOC from State Govt.',
    codeHints: ['1', 'recognition', 'approval'],
  },
  {
    key: 'intake',
    name: 'Intake Compliance',
    shortLabel: 'Intake',
    icon: Users,
    accent: 'text-indigo-600',
    description: 'Approved intake vs filled seats, teacher-educator qualifications (NET/PhD), PTR norms.',
    codeHints: ['2', 'intake', 'faculty'],
  },
  {
    key: 'infrastructure',
    name: 'Infrastructure',
    shortLabel: 'Infra',
    icon: Building2,
    accent: 'text-sky-600',
    description: 'Teaching-practice school tie-ups, library, ICT lab, psychology lab, health & PE resources.',
    codeHints: ['3', 'infra', 'library'],
  },
  {
    key: 'curriculum',
    name: 'Curriculum Transaction',
    shortLabel: 'Curriculum',
    icon: BookOpen,
    accent: 'text-emerald-600',
    description: 'Theory + practice-teaching hours per NCTE syllabus, school internship logs, lesson plans.',
    codeHints: ['4', 'curriculum', 'practice'],
  },
  {
    key: 'evaluation',
    name: 'Evaluation',
    shortLabel: 'Evaluation',
    icon: ClipboardCheck,
    accent: 'text-amber-600',
    description: 'Internal + external assessment records, result analyses, examination reforms.',
    codeHints: ['5', 'evaluation', 'exam'],
  },
];

// Programs offered under NCTE at JKKN College of Education
const NCTE_PROGRAMS = [
  { code: 'BED', name: 'B.Ed', duration: '2 years', intake: 'Per NCTE approval' },
  { code: 'MED', name: 'M.Ed', duration: '2 years', intake: 'Per NCTE approval' },
  { code: 'DELED', name: 'D.El.Ed', duration: '2 years', intake: 'Per NCTE approval' },
];

// ----------------------------------------------------------------------------
// Page
// ----------------------------------------------------------------------------
export default function NCTEDashboardPage() {
  const ncteMeta = ACCREDITATION_BODIES.find((b) => b.code === 'NCTE')!;
  const { data: institutions, isLoading: institutionsLoading } = useJKKNInstitutions();

  // Auto-detect JKKN College of Education by iqac_code='EDUC' OR name contains "education"
  const educationInstitution = (institutions ?? []).find((inst) => {
    const code = (inst.iqac_code ?? '').toUpperCase();
    const name = (inst.name ?? '').toLowerCase();
    return code === 'EDUC' || name.includes('education');
  });

  const educationId = educationInstitution?.id;

  const { data: metrics, isLoading: metricsLoading } = useBodyMetrics('NCTE');
  const { data: evidenceCounts, isLoading: evidenceLoading } = useBodyEvidenceCounts(
    'NCTE',
    educationId ?? [],
  );

  // Group metrics into domains using codeHints — fallback bucket for unmatched.
  function domainFor(metric: BodyMetricRow): string {
    const code = (metric.metric_code ?? '').toLowerCase();
    const cat = (metric.category ?? '').toLowerCase();
    for (const d of NCTE_DOMAINS) {
      if (d.codeHints.some((h) => code.startsWith(h) || code.includes(h) || cat.includes(h))) {
        return d.key;
      }
    }
    return 'other';
  }

  const metricsByDomain = (metrics ?? []).reduce<Record<string, BodyMetricRow[]>>((acc, m) => {
    const k = domainFor(m);
    if (!acc[k]) acc[k] = [];
    acc[k]!.push(m);
    return acc;
  }, {});

  const totalMetrics = (metrics ?? []).length;
  const totalEvidence = Object.values(evidenceCounts ?? {}).reduce((s, n) => s + n, 0);
  const totalMaxScore = (metrics ?? []).reduce((s, m) => s + (m.max_score ?? 0), 0);

  return (
    <ContentLayout title="NCTE — Teacher Education Compliance">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'NCTE', href: '/accreditation/ncte' },
        ]}
      />

      <div className="space-y-6">
        {/* Header */}
        <Card className={`border-2 ${ncteMeta.accentClass}`}>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <GraduationCap className="h-7 w-7 text-teal-600" />
                  NCTE — Teacher Education Compliance
                </CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">
                  National Council for Teacher Education. Scope: JKKN College of
                  Education (B.Ed + M.Ed + D.El.Ed). NCTE Regulations 2014 /
                  amended 2021 — recognition + intake + infrastructure +
                  curriculum transaction + evaluation.
                </p>
              </div>

              {/* Fixed-scope badge — NCTE applies to education college only */}
              <div className="min-w-[240px]">
                <div className="rounded-lg border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Scope (auto-detected)</div>
                  <div className="mt-1 font-semibold text-sm">
                    {institutionsLoading
                      ? 'Detecting…'
                      : educationInstitution
                      ? `${educationInstitution.iqac_code ?? ''} ${educationInstitution.name}`.trim()
                      : 'No education college found'}
                  </div>
                  {educationInstitution && (
                    <Badge variant="outline" className="mt-1 text-[10px]">
                      Fixed scope — 1 college
                    </Badge>
                  )}
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
                <div className="text-lg font-semibold">{ncteMeta.cycleLabel}</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/accreditation/coverage">
                <Button variant="outline" size="sm">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Coverage matrix
                </Button>
              </Link>
              <Link href="/accreditation">
                <Button variant="outline" size="sm">
                  <School className="mr-2 h-4 w-4" />
                  All 10 bodies
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Programs under NCTE recognition */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-teal-600" />
              Programs under NCTE Recognition
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              {NCTE_PROGRAMS.map((p) => (
                <div key={p.code} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{p.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {p.duration}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{p.intake}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 5 compliance domain cards */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {NCTE_DOMAINS.map((d) => {
            const metricList = metricsByDomain[d.key] ?? [];
            const domainEvidence = metricList.reduce(
              (s, m) => s + (evidenceCounts?.[m.metric_code] ?? 0),
              0,
            );
            const domainMaxScore = metricList.reduce((s, m) => s + (m.max_score ?? 0), 0);
            const Icon = d.icon;
            return (
              <Card key={d.key} className="h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className={`h-5 w-5 ${d.accent}`} />
                      <span>{d.shortLabel}</span>
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px]">
                      {metricList.length} metrics
                    </Badge>
                  </div>
                  <p className="text-sm font-medium">{d.name}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">{d.description}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Max score</div>
                      <div className="text-lg font-semibold">{domainMaxScore || '—'}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Evidence</div>
                      <div className="text-lg font-semibold">{domainEvidence}</div>
                    </div>
                  </div>
                  {metricList.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        {metricList.length} metric{metricList.length === 1 ? '' : 's'}
                      </summary>
                      <ul className="mt-2 space-y-1 pl-2">
                        {metricList.map((m) => (
                          <li key={m.metric_code} className="flex items-start justify-between gap-2">
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

        {/* Footer */}
        <Card className="bg-muted/30">
          <CardContent className="pt-6 text-xs text-muted-foreground space-y-2">
            <p>
              <strong>Scope detection:</strong> NCTE applies only to JKKN College
              of Education (detected by <code>iqac_code=&apos;EDUC&apos;</code> or name
              match). If the auto-detect fails, verify{' '}
              <code>institutions.iqac_code</code> seeding.
            </p>
            <p>
              <strong>Coverage formula (placeholder):</strong> evidence_rows /
              metrics_seeded. Real weighted NCTE-specific rubric lands as the
              catalog is seeded per <code>docs/one-jkkn-one-data.md §8</code>.
            </p>
            <p>
              Evidence rows originate from the PR-A2 substrate + future fan-out
              triggers (e.g. school internship logs, teacher-educator
              qualification records). Additional fan-outs will wire as source
              modules are retrofitted per the Compliance Unification Program.
            </p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
