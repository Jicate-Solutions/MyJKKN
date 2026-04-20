// app/(routes)/accreditation/aicte/page.tsx
// ============================================================================
// PR-A15 — AICTE Dashboard (Unification Program, 15/15)
//
// All India Council for Technical Education — applies to JKKN Engineering +
// Pharmacy (auto-detected by iqac_code IN ('ENGG','PHAR') OR name match).
// Annual Extension of Approval (EoA) cycle.
// Tracks 5 domains: Intake Approval, Faculty Ratios, Infrastructure,
// Industry Partnerships, Student Support.
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
  Cog,
  BarChart3,
  Users,
  Building2,
  Briefcase,
  LifeBuoy,
  FileCheck,
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
// AICTE compliance domains — 5 categories per AICTE APH (Approval Process
// Handbook) annual EoA cycle.
// ----------------------------------------------------------------------------
interface AICTEDomain {
  key: string;
  name: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  description: string;
  codeHints: string[];
}

const AICTE_DOMAINS: AICTEDomain[] = [
  {
    key: 'intake',
    name: 'Intake Approval (EoA)',
    shortLabel: 'EoA / Intake',
    icon: FileCheck,
    accent: 'text-sky-600',
    description: 'Annual Extension of Approval — sanctioned intake, actual admissions, program-wise approvals.',
    codeHints: ['1', 'intake', 'eoa', 'approval'],
  },
  {
    key: 'faculty',
    name: 'Faculty Ratios',
    shortLabel: 'Faculty',
    icon: Users,
    accent: 'text-indigo-600',
    description: 'AICTE-compliant Faculty-Student Ratio — 1:15 for UG, 1:12 for PG. Qualification norms.',
    codeHints: ['2', 'faculty', 'ratio'],
  },
  {
    key: 'infrastructure',
    name: 'Infrastructure',
    shortLabel: 'Infra',
    icon: Building2,
    accent: 'text-emerald-600',
    description: 'Campus area, built-up area, library volumes, lab equipment per AICTE APH norms.',
    codeHints: ['3', 'infra', 'library', 'lab'],
  },
  {
    key: 'industry',
    name: 'Industry Partnerships',
    shortLabel: 'Industry',
    icon: Briefcase,
    accent: 'text-amber-600',
    description: 'MoUs with industry, internships (mandatory), placement percentage, industry-visits.',
    codeHints: ['4', 'industry', 'mou', 'internship', 'placement'],
  },
  {
    key: 'support',
    name: 'Student Support',
    shortLabel: 'Support',
    icon: LifeBuoy,
    accent: 'text-rose-600',
    description: 'Counselling, grievance redressal, mandatory scholarships, anti-ragging, SC/ST/OBC support.',
    codeHints: ['5', 'support', 'counsel', 'grievance', 'scholarship'],
  },
];

// ----------------------------------------------------------------------------
// Page
// ----------------------------------------------------------------------------
export default function AICTEDashboardPage() {
  const aicteMeta = ACCREDITATION_BODIES.find((b) => b.code === 'AICTE')!;
  const { data: institutions, isLoading: institutionsLoading } = useJKKNInstitutions();

  // Auto-detect Engineering + Pharmacy colleges
  const technicalInstitutions = (institutions ?? []).filter((inst) => {
    const code = (inst.iqac_code ?? '').toUpperCase();
    const name = (inst.name ?? '').toLowerCase();
    return (
      code === 'ENGG' ||
      code === 'PHAR' ||
      code === 'PHARM' ||
      name.includes('engineering') ||
      name.includes('pharmacy')
    );
  });

  const technicalIds = technicalInstitutions.map((i) => i.id);

  const { data: metrics, isLoading: metricsLoading } = useBodyMetrics('AICTE');
  const { data: evidenceCounts, isLoading: evidenceLoading } = useBodyEvidenceCounts(
    'AICTE',
    technicalIds,
  );

  function domainFor(metric: BodyMetricRow): string {
    const code = (metric.metric_code ?? '').toLowerCase();
    const cat = (metric.category ?? '').toLowerCase();
    for (const d of AICTE_DOMAINS) {
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
    <ContentLayout title="AICTE — Technical Education Compliance">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'AICTE', href: '/accreditation/aicte' },
        ]}
      />

      <div className="space-y-6">
        {/* Header */}
        <Card className={`border-2 ${aicteMeta.accentClass}`}>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Cog className="h-7 w-7 text-sky-600" />
                  AICTE — Technical Education Compliance
                </CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">
                  All India Council for Technical Education. Scope: JKKN
                  Engineering + Pharmacy. Annual Extension of Approval (EoA)
                  cycle — intake, faculty ratios, infrastructure, industry
                  partnerships, student support.
                </p>
              </div>

              {/* Auto-detected institutions */}
              <div className="min-w-[260px]">
                <div className="rounded-lg border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Scope (auto-detected)</div>
                  <div className="mt-1 space-y-1">
                    {institutionsLoading ? (
                      <div className="text-sm">Detecting…</div>
                    ) : technicalInstitutions.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No technical colleges found</div>
                    ) : (
                      technicalInstitutions.map((inst) => (
                        <div key={inst.id} className="text-xs font-medium">
                          {inst.iqac_code ? `[${inst.iqac_code}] ` : ''}
                          {inst.name}
                        </div>
                      ))
                    )}
                  </div>
                  {technicalInstitutions.length > 0 && (
                    <Badge variant="outline" className="mt-2 text-[10px]">
                      {technicalInstitutions.length} technical college
                      {technicalInstitutions.length === 1 ? '' : 's'}
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
                <div className="text-lg font-semibold">{aicteMeta.cycleLabel}</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/accreditation/coverage">
                <Button variant="outline" size="sm">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Coverage matrix
                </Button>
              </Link>
              <Link href="/accreditation/nba">
                <Button variant="outline" size="sm">
                  <Cog className="mr-2 h-4 w-4" />
                  NBA program accreditation
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

        {/* 5 compliance domain cards */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {AICTE_DOMAINS.map((d) => {
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
              <strong>Scope detection:</strong> AICTE applies to Engineering +
              Pharmacy only (detected by <code>iqac_code IN (&apos;ENGG&apos;,&apos;PHAR&apos;)</code> or
              name match). Evidence is aggregated across both colleges.
            </p>
            <p>
              <strong>Faculty Ratio note:</strong> AICTE mandates 1:15 for UG
              and 1:12 for PG. Per-college breakdown + compliance status lands
              when the ratio-calculator trigger wires up (see
              <code> docs/one-jkkn-one-data.md §8</code>).
            </p>
            <p>
              Evidence rows originate from the PR-A2 substrate. Future fan-outs
              will emit from placement module, grievance module (PR-A6),
              anti-ragging affidavits (PR-A5 — already live), and internship
              tracking as each source is retrofitted.
            </p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
