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
// Scope: cluster (all 8 JKKN colleges) with college switcher, since each
// college submits its own NIRF data. Evidence sourced from PR-A2 substrate.
//
// NOTE: sidebar entry + permission key `accreditation.nirf.view` ship with
// PR-A8 c2 (#255) — this PR only adds the page + hook.
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
} from 'lucide-react';
import { ACCREDITATION_BODIES } from '@/lib/types/accreditation';
import {
  useNIRFMetrics,
  useNIRFEvidenceCounts,
  useJKKNInstitutionsNIRF,
  type NIRFMetric,
} from '@/hooks/accreditation/use-nirf-dashboard';

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

export default function NIRFDashboardPage() {
  const [selectedInstitution, setSelectedInstitution] = useState<string>('cluster');

  const { data: institutions, isLoading: instLoading } = useJKKNInstitutionsNIRF();
  const { data: metrics, isLoading: metricsLoading } = useNIRFMetrics();
  const { data: evidenceCounts, isLoading: evidenceLoading } = useNIRFEvidenceCounts(
    selectedInstitution as any,
  );

  const nirfMeta = ACCREDITATION_BODIES.find((b) => b.code === 'NIRF')!;

  const metricsByParameter = groupMetricsByParameter(metrics ?? []);
  const totalMetrics = (metrics ?? []).length;
  const totalMaxScore = (metrics ?? []).reduce((s, m) => s + (m.max_score ?? 0), 0);
  const totalEvidence = Object.values(evidenceCounts ?? {}).reduce((s, n) => s + n, 0);

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
                  Each JKKN college submits its own data — cluster view shows aggregated
                  evidence across all 8 colleges.
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
            const paramEvidence = metricList.reduce(
              (s, m) => s + (evidenceCounts?.[m.metric_code] ?? 0),
              0,
            );
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
                      <div className="text-lg font-semibold">{paramEvidence}</div>
                    </div>
                  </div>
                  {metricList.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        {metricList.length} sub-metric{metricList.length === 1 ? '' : 's'}
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
