'use client';

import { useState, useCallback } from 'react';
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
  Download, BarChart3, GraduationCap, Target, Activity, Lightbulb, TrendingUp,
} from 'lucide-react';

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

const FINKS_LABELS: Record<string, string> = {
  foundational_knowledge: 'Foundational Knowledge', application: 'Application', integration: 'Integration',
  human_dimension: 'Human Dimension', caring: 'Caring', learning_how_to_learn: 'Learning How to Learn',
};
const AGENCY_LABELS: Record<string, string> = {
  dependent: 'Dependent', directed: 'Directed', independent: 'Independent', self_directed: 'Self-Directed', principal: 'Principal',
};

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

export default function NAACEvidencePage() {
  const engagement = useNAACEngagement();
  const obe = useNAACOBE();
  const finks = useNAACFinks();
  const agency = useNAACAgency();
  const innovation = useNAACInnovation();

  return (
    <ContentLayout title="NAAC Evidence Report">
      <PageBreadcrumb items={[{ label: 'Admin', href: '/admin' }, { label: 'PDE', href: '/admin/pde/assessments' }, { label: 'NAAC Evidence' }]} />
      <div className="space-y-6 p-4">
        <div>
          <h1 className="text-2xl font-bold">NAAC Evidence Report</h1>
          <p className="text-sm text-muted-foreground mt-1">Auto-generated evidence data from the Principal Development Engine</p>
        </div>

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
    </ContentLayout>
  );
}
