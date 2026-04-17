// app/(routes)/accreditation/naac/page.tsx
// ============================================================================
// PR-A8 — NAAC Dashboard (Unification Program primary body, 8/15)
//
// IQAC-facing dashboard showing the 10 NAAC attributes with per-attribute
// metric counts + evidence counts sourced from the PR-A2 substrate.
//
// Reuses PR-A7 infrastructure:
//   - AccreditationService.getLandingScoreboard() / getCoverageMatrix()
//   - AccreditationBodyCode + BodyMeta types
//
// Sub-routes coming in PR-A8 commit 2 (or follow-up):
//   /accreditation/naac/committees   — IQAC committee CRUD
//   /accreditation/naac/dcf-export   — DCF 2025 / AQAR export (super admin)
//   /accreditation/naac/surveys      — 8.4 LES + DPDPA consent
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

function useNAACEvidenceCounts(institutionId: string | 'cluster') {
  return useQuery({
    queryKey: ['accreditation', 'naac', 'evidence-counts', institutionId],
    queryFn: async (): Promise<Record<string, number>> => {
      const sb = createClientSupabaseClient() as any;
      let query = sb
        .from('quality_evidence_mappings')
        .select('metric_code')
        .eq('body_code', 'NAAC');
      if (institutionId !== 'cluster') {
        query = query.eq('institution_id', institutionId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).reduce<Record<string, number>>((acc: Record<string, number>, row: any) => {
        acc[row.metric_code] = (acc[row.metric_code] ?? 0) + 1;
        return acc;
      }, {});
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

  const totalMetrics = (metrics ?? []).length;
  const totalEvidence = Object.values(evidenceCounts ?? {}).reduce((s, n) => s + n, 0);
  const totalMaxScore = (metrics ?? []).reduce((s, m) => s + (m.max_score ?? 0), 0);

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
                <div className="text-lg font-semibold">3-year binary</div>
              </div>
            </div>

            {/* Quick actions — sub-routes not yet built; placeholders */}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/accreditation/coverage">
                <Button variant="outline" size="sm">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Coverage matrix
                </Button>
              </Link>
              <Button variant="outline" size="sm" disabled title="Lands in PR-A8 commit 2">
                <Users className="mr-2 h-4 w-4" />
                IQAC committees (soon)
              </Button>
              <Button variant="outline" size="sm" disabled title="Lands in PR-A8 commit 2">
                <FileText className="mr-2 h-4 w-4" />
                DCF 2025 / AQAR export (soon)
              </Button>
              <Button variant="outline" size="sm" disabled title="Lands in PR-A8 commit 2">
                <Download className="mr-2 h-4 w-4" />
                8.4 Survey export (soon)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 10 attribute cards */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {NAAC_ATTRIBUTES.map((attr) => {
            const metricList = metricsByAttribute[attr.key] ?? [];
            const attrMaxScore = metricList.reduce((s, m) => s + (m.max_score ?? 0), 0);
            const attrEvidence = metricList.reduce(
              (s, m) => s + (evidenceCounts?.[m.metric_code] ?? 0),
              0,
            );
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
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Max score</div>
                      <div className="text-lg font-semibold">{attrMaxScore || '—'}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Evidence</div>
                      <div className="text-lg font-semibold">{attrEvidence}</div>
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
              <strong>Coverage formula (placeholder):</strong> evidence_rows / metrics_seeded.
              Real NAAC weighted formula (Binary + MBGL rubric) lands in PR-A8 commit 2
              once the full 90-row NAAC catalog is reviewed against{' '}
              <code>docs/one-jkkn-one-data.md §8</code>.
            </p>
            <p>
              <strong>Principal = IQAC Chairman</strong> by NAAC mandate. HoDs
              are Department IQAC Coordinators. Continuous-improvement is the
              methodology; IQAC is not a separate committee below the Principal
              but the discipline embedded at every governance level.
            </p>
            <p>
              Evidence rows are auto-emitted by fan-out triggers (PR-A5
              anti-ragging → 7.7.1; PR-A3 admission → 2.1.1 on demand).
              Additional fan-outs will wire up as each source module is retrofitted.
            </p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
