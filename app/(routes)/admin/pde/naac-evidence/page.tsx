'use client';

import { useState, useMemo, useCallback } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useCapabilities,
  useLeaderboard,
} from '@/hooks/pde/use-pde';
import { useQuery } from '@tanstack/react-query';
import { PDEService } from '@/lib/services/pde-service';
import {
  Download,
  BarChart3,
  GraduationCap,
  Target,
  Activity,
  Lightbulb,
  TrendingUp,
} from 'lucide-react';
import type { PDECapability, PDEReputation } from '@/types/pde';

// ============================================
// CSV Export Helper
// ============================================

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
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join(',')
    ),
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================
// Hooks for NAAC data
// ============================================

function useNAACEngagementMetrics() {
  return useQuery({
    queryKey: ['pde', 'naac', 'engagement'],
    queryFn: async () => {
      const supabase = (await import('@/lib/supabase/client')).createClientSupabaseClient();

      // Total enrollments
      const { count: totalEnrollments } = await supabase
        .from('pde_quest_enrollments')
        .select('*', { count: 'exact', head: true });

      // Completed enrollments
      const { count: completedEnrollments } = await supabase
        .from('pde_quest_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed');

      // Total submissions
      const { count: totalSubmissions } = await supabase
        .from('pde_submissions')
        .select('*', { count: 'exact', head: true });

      // Passed submissions
      const { count: passedSubmissions } = await supabase
        .from('pde_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('passed', true);

      // Average time on task from engagement daily
      const { data: engData } = await supabase
        .from('pde_engagement_daily')
        .select('time_spent_minutes');
      const avgTime = engData && engData.length > 0
        ? Math.round(engData.reduce((s, r) => s + (r.time_spent_minutes || 0), 0) / engData.length)
        : 0;

      // Certificates issued
      const { count: certificatesIssued } = await supabase
        .from('pde_certificates')
        .select('*', { count: 'exact', head: true });

      return {
        totalEnrollments: totalEnrollments || 0,
        completedEnrollments: completedEnrollments || 0,
        completionRate: totalEnrollments ? Math.round(((completedEnrollments || 0) / totalEnrollments) * 100) : 0,
        totalSubmissions: totalSubmissions || 0,
        passedSubmissions: passedSubmissions || 0,
        assessmentPassRate: totalSubmissions ? Math.round(((passedSubmissions || 0) / totalSubmissions) * 100) : 0,
        avgTimeOnTask: avgTime,
        certificatesIssued: certificatesIssued || 0,
      };
    },
  });
}

function useNAACOBEData() {
  return useQuery({
    queryKey: ['pde', 'naac', 'obe'],
    queryFn: async () => {
      const supabase = (await import('@/lib/supabase/client')).createClientSupabaseClient();

      // Get all capabilities
      const { data: capabilities } = await supabase
        .from('pde_capabilities')
        .select('id, name, category, level')
        .order('category')
        .order('level');

      if (!capabilities || capabilities.length === 0) return [];

      // Get demonstration counts per capability
      const results = [];
      for (const cap of capabilities) {
        const { count: demonstrated } = await supabase
          .from('pde_learner_capabilities')
          .select('*', { count: 'exact', head: true })
          .eq('capability_id', cap.id)
          .in('status', ['demonstrated', 'mastered']);

        const { count: total } = await supabase
          .from('pde_learner_capabilities')
          .select('*', { count: 'exact', head: true })
          .eq('capability_id', cap.id);

        results.push({
          capability_name: cap.name,
          category: cap.category,
          level: cap.level,
          demonstrated_count: demonstrated || 0,
          total_enrolled: total || 0,
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
      const supabase = (await import('@/lib/supabase/client')).createClientSupabaseClient();

      // Get all certificates with finks_profile
      const { data: certs } = await supabase
        .from('pde_certificates')
        .select('finks_profile')
        .not('finks_profile', 'is', null);

      const dimensions = [
        'foundational_knowledge', 'application', 'integration',
        'human_dimension', 'caring', 'learning_how_to_learn',
      ];

      const results: Record<string, { avg: number; count: number; min: number; max: number }> = {};
      for (const dim of dimensions) {
        const values = (certs || [])
          .map(c => (c.finks_profile as Record<string, number>)?.[dim])
          .filter((v): v is number => v != null);

        results[dim] = {
          avg: values.length > 0 ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : 0,
          count: values.length,
          min: values.length > 0 ? Math.min(...values) : 0,
          max: values.length > 0 ? Math.max(...values) : 0,
        };
      }

      return results;
    },
  });
}

function useNAACAgencyDistribution() {
  return useQuery({
    queryKey: ['pde', 'naac', 'agency'],
    queryFn: async () => {
      const supabase = (await import('@/lib/supabase/client')).createClientSupabaseClient();

      const { data } = await supabase
        .from('pde_agency_index')
        .select('learner_id, overall, level')
        .order('assessment_date', { ascending: false });

      if (!data || data.length === 0) return { distribution: {}, total: 0 };

      // Deduplicate: keep latest per learner
      const latestPerLearner = new Map<string, { overall: number; level: string }>();
      for (const row of data) {
        if (!latestPerLearner.has(row.learner_id)) {
          latestPerLearner.set(row.learner_id, { overall: row.overall, level: row.level });
        }
      }

      const distribution: Record<string, number> = {
        dependent: 0,
        directed: 0,
        independent: 0,
        self_directed: 0,
        principal: 0,
      };

      for (const { level } of latestPerLearner.values()) {
        if (distribution[level] !== undefined) distribution[level]++;
      }

      return { distribution, total: latestPerLearner.size };
    },
  });
}

function useNAACInnovation() {
  return useQuery({
    queryKey: ['pde', 'naac', 'innovation'],
    queryFn: async () => {
      const supabase = (await import('@/lib/supabase/client')).createClientSupabaseClient();

      const { count: questsCompleted } = await supabase
        .from('pde_quest_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed');

      const { count: solutionsDeployed } = await supabase
        .from('pde_quests')
        .select('*', { count: 'exact', head: true })
        .eq('solutions_hub_eligible', true)
        .eq('status', 'completed');

      const { count: nifSubmissions } = await supabase
        .from('pde_quests')
        .select('*', { count: 'exact', head: true })
        .eq('nif_eligible', true);

      const { count: peerReviews } = await supabase
        .from('pde_reputation')
        .select('peer_reviews_given')
        .gt('peer_reviews_given', 0);

      return {
        questsCompleted: questsCompleted || 0,
        solutionsDeployed: solutionsDeployed || 0,
        nifSubmissions: nifSubmissions || 0,
        peerReviews: peerReviews || 0,
      };
    },
  });
}

// ============================================
// NAAC Label Helpers
// ============================================

const FINKS_LABELS: Record<string, string> = {
  foundational_knowledge: 'Foundational Knowledge',
  application: 'Application',
  integration: 'Integration',
  human_dimension: 'Human Dimension',
  caring: 'Caring',
  learning_how_to_learn: 'Learning How to Learn',
};

const AGENCY_LABELS: Record<string, string> = {
  dependent: 'Dependent',
  directed: 'Directed',
  independent: 'Independent',
  self_directed: 'Self-Directed',
  principal: 'Principal',
};

// ============================================
// Main Page
// ============================================

export default function NAACEvidencePage() {
  const engagement = useNAACEngagementMetrics();
  const obe = useNAACOBEData();
  const finks = useNAACFinks();
  const agency = useNAACAgencyDistribution();
  const innovation = useNAACInnovation();

  const handleExportOBE = useCallback(() => {
    if (obe.data) {
      downloadCSV(obe.data as unknown as Record<string, unknown>[], 'naac-obe-attainment.csv');
    }
  }, [obe.data]);

  const handleExportEngagement = useCallback(() => {
    if (engagement.data) {
      downloadCSV([engagement.data as unknown as Record<string, unknown>], 'naac-engagement-metrics.csv');
    }
  }, [engagement.data]);

  const handleExportFinks = useCallback(() => {
    if (finks.data) {
      const rows = Object.entries(finks.data).map(([dim, stats]) => ({
        dimension: FINKS_LABELS[dim] || dim,
        average: stats.avg,
        count: stats.count,
        min: stats.min,
        max: stats.max,
      }));
      downloadCSV(rows, 'naac-finks-competency.csv');
    }
  }, [finks.data]);

  const handleExportAgency = useCallback(() => {
    if (agency.data) {
      const rows = Object.entries(agency.data.distribution).map(([level, count]) => ({
        level: AGENCY_LABELS[level] || level,
        count,
        percentage: agency.data.total > 0 ? Math.round((count / agency.data.total) * 100) : 0,
      }));
      downloadCSV(rows, 'naac-agency-distribution.csv');
    }
  }, [agency.data]);

  const handleExportInnovation = useCallback(() => {
    if (innovation.data) {
      downloadCSV([innovation.data as unknown as Record<string, unknown>], 'naac-innovation-metrics.csv');
    }
  }, [innovation.data]);

  return (
    <ContentLayout title="NAAC Evidence Report">
      <PageBreadcrumb
        items={[
          { label: 'Admin', href: '/admin' },
          { label: 'PDE', href: '/admin/pde/assessments' },
          { label: 'NAAC Evidence' },
        ]}
      />

      <div className="space-y-6 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">NAAC Evidence Report</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Auto-generated evidence data from the Principal Development Engine for NAAC accreditation
            </p>
          </div>
        </div>

        {/* Section 1: OBE Attainment */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="w-5 h-5 text-emerald-600" />
              OBE Attainment (Outcome-Based Education)
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleExportOBE} disabled={!obe.data?.length}>
              <Download className="w-4 h-4 mr-1" /> Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Percentage of Learners who demonstrated each capability (maps to Course Outcomes)
            </p>
            {obe.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (obe.data || []).length === 0 ? (
              <p className="text-sm text-gray-500 italic">No capability data yet. Capabilities will appear as Learners demonstrate them.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Capability (Course Outcome)</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead className="text-right">Demonstrated</TableHead>
                    <TableHead className="text-right">Enrolled</TableHead>
                    <TableHead className="text-right">Attainment %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(obe.data || []).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{row.capability_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-xs">
                          {row.category.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>L{row.level}</TableCell>
                      <TableCell className="text-right">{row.demonstrated_count}</TableCell>
                      <TableCell className="text-right">{row.total_enrolled}</TableCell>
                      <TableCell className="text-right font-semibold">
                        <span className={row.attainment_pct >= 60 ? 'text-emerald-600' : row.attainment_pct >= 30 ? 'text-amber-600' : 'text-red-600'}>
                          {row.attainment_pct}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Section 2: Engagement Metrics */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="w-5 h-5 text-blue-600" />
              Engagement Metrics
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleExportEngagement} disabled={!engagement.data}>
              <Download className="w-4 h-4 mr-1" /> Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            {engagement.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : engagement.data ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard label="Quest Enrollments" value={engagement.data.totalEnrollments} />
                <MetricCard label="Completion Rate" value={`${engagement.data.completionRate}%`} />
                <MetricCard label="Assessment Pass Rate" value={`${engagement.data.assessmentPassRate}%`} />
                <MetricCard label="Avg Time on Task" value={`${engagement.data.avgTimeOnTask} min/day`} />
                <MetricCard label="Total Submissions" value={engagement.data.totalSubmissions} />
                <MetricCard label="Passed Submissions" value={engagement.data.passedSubmissions} />
                <MetricCard label="Certificates Issued" value={engagement.data.certificatesIssued} />
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">No engagement data available yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Section 3: Competency Distribution (Fink's) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="w-5 h-5 text-purple-600" />
              Competency Distribution (Fink&apos;s Taxonomy)
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleExportFinks} disabled={!finks.data}>
              <Download className="w-4 h-4 mr-1" /> Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            {finks.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : finks.data ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dimension</TableHead>
                    <TableHead className="text-right">Average Score</TableHead>
                    <TableHead className="text-right">Learners</TableHead>
                    <TableHead className="text-right">Min</TableHead>
                    <TableHead className="text-right">Max</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(finks.data).map(([dim, stats]) => (
                    <TableRow key={dim}>
                      <TableCell className="font-medium">{FINKS_LABELS[dim] || dim}</TableCell>
                      <TableCell className="text-right font-semibold">{stats.avg}</TableCell>
                      <TableCell className="text-right">{stats.count}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{stats.min}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{stats.max}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-gray-500 italic">No Fink&apos;s taxonomy data available yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Section 4: Placement Readiness (Agency Index) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-5 h-5 text-amber-600" />
              Placement Readiness (Agency Index Distribution)
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleExportAgency} disabled={!agency.data}>
              <Download className="w-4 h-4 mr-1" /> Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            {agency.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : agency.data && agency.data.total > 0 ? (
              <div>
                <p className="text-sm text-muted-foreground mb-4">
                  {agency.data.total} Learners assessed for agency readiness
                </p>
                <div className="grid grid-cols-5 gap-3">
                  {Object.entries(agency.data.distribution).map(([level, count]) => {
                    const pct = agency.data!.total > 0 ? Math.round((count / agency.data!.total) * 100) : 0;
                    return (
                      <div key={level} className="text-center p-3 rounded-lg bg-muted/50">
                        <div className="text-2xl font-bold">{count}</div>
                        <div className="text-xs text-muted-foreground capitalize mt-1">
                          {AGENCY_LABELS[level] || level}
                        </div>
                        <div className="text-xs font-semibold text-muted-foreground">{pct}%</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">No agency index data available yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Section 5: Innovation Metrics */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="w-5 h-5 text-yellow-600" />
              Innovation Metrics
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleExportInnovation} disabled={!innovation.data}>
              <Download className="w-4 h-4 mr-1" /> Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            {innovation.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : innovation.data ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard label="Quests Completed" value={innovation.data.questsCompleted} />
                <MetricCard label="Solutions Deployed" value={innovation.data.solutionsDeployed} />
                <MetricCard label="NIF Submissions" value={innovation.data.nifSubmissions} />
                <MetricCard label="Peer Reviews" value={innovation.data.peerReviews} />
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">No innovation data available yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

// ============================================
// Metric Card Component
// ============================================

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
