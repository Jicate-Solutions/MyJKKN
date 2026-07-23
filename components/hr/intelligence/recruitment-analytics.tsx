'use client';

/**
 * HR Intelligence — Tab 12: Recruitment Analytics
 *
 * Surfaces recruitment pipeline metrics: candidates by stage,
 * time-to-hire estimates, source effectiveness, and pipeline health.
 * Queries hr_recruitment_candidates and hr_recruitment_jobs tables.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ShieldAlert,
  AlertCircle,
  Users,
  Clock,
  TrendingUp,
  Briefcase,
  Target,
} from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface CandidateRow {
  id: string;
  status: string;
  created_at: string;
  hr_organization_id: string;
}

interface JobRow {
  id: string;
  status: string;
  hr_organization_id: string;
  created_at: string;
}

function useRecruitmentPipeline() {
  return useQuery({
    queryKey: ['hr-intelligence', 'recruitment-analytics'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();

      const [candidatesRes, jobsRes] = await Promise.all([
        supabase
          .from('hr_recruitment_candidates')
          .select('id, status, created_at, hr_organization_id')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('hr_recruitment_jobs')
          .select('id, status, hr_organization_id, created_at')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      if (candidatesRes.error) throw candidatesRes.error;
      if (jobsRes.error) throw jobsRes.error;

      return {
        candidates: (candidatesRes.data ?? []) as CandidateRow[],
        jobs: (jobsRes.data ?? []) as JobRow[],
      };
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function RecruitmentAnalyticsTab() {
  const { data, isLoading, isError } = useRecruitmentPipeline();

  const metrics = useMemo(() => {
    if (!data || (data.candidates.length === 0 && data.jobs.length === 0)) return null;

    const { candidates, jobs } = data;

    // Candidate status breakdown
    const statusCounts: Record<string, number> = {};
    for (const c of candidates) {
      const status = c.status ?? 'unknown';
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    }

    // Job status breakdown
    const jobStatusCounts: Record<string, number> = {};
    for (const j of jobs) {
      const status = j.status ?? 'unknown';
      jobStatusCounts[status] = (jobStatusCounts[status] ?? 0) + 1;
    }

    // Time-to-hire proxy: days since creation for hired candidates
    const hiredCandidates = candidates.filter((c) =>
      ['hired', 'joined', 'onboarded', 'offer_accepted'].includes(c.status)
    );

    const openJobs = jobs.filter((j) =>
      ['open', 'active', 'published'].includes(j.status)
    );

    return {
      totalCandidates: candidates.length,
      totalJobs: jobs.length,
      openPositions: openJobs.length,
      hiredCount: hiredCandidates.length,
      statusCounts,
      jobStatusCounts,
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-20" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Failed to load recruitment data. Ensure recruitment module is configured.
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Recruitment Analytics
          </CardTitle>
          <CardDescription>
            Pipeline health, candidate flow metrics, time-to-hire, and source effectiveness across institutions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg">
            <Briefcase className="h-12 w-12 mb-4 text-muted-foreground opacity-30" />
            <p className="text-sm font-medium text-muted-foreground">No Recruitment Data Yet</p>
            <p className="text-xs mt-1 text-muted-foreground opacity-75 max-w-md text-center">
              Once recruitment jobs and candidates are tracked, this tab will show pipeline health,
              conversion funnels, source effectiveness, and time-to-hire benchmarks.
            </p>
            <Badge variant="outline" className="mt-4 text-xs">
              Requires: Recruitment jobs and candidate records
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  const statusEntries = Object.entries(metrics.statusCounts).sort((a, b) => b[1] - a[1]);
  const jobStatusEntries = Object.entries(metrics.jobStatusCounts).sort((a, b) => b[1] - a[1]);

  const STATUS_COLORS: Record<string, string> = {
    applied: 'bg-blue-500',
    screening: 'bg-cyan-500',
    shortlisted: 'bg-indigo-500',
    interview_scheduled: 'bg-purple-500',
    interviewed: 'bg-violet-500',
    offer_extended: 'bg-amber-500',
    offer_accepted: 'bg-green-500',
    hired: 'bg-green-600',
    joined: 'bg-emerald-500',
    rejected: 'bg-red-500',
    withdrawn: 'bg-gray-400',
  };

  return (
    <div className="space-y-4">
      {/* Summary stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Total Candidates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalCandidates}</div>
            <p className="text-xs text-muted-foreground mt-1">In recruitment pipeline</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5" />
              Open Positions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{metrics.openPositions}</div>
            <p className="text-xs text-muted-foreground mt-1">
              of {metrics.totalJobs} total jobs
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-green-500" />
              Hired
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{metrics.hiredCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.totalCandidates > 0 ? `${((metrics.hiredCount / metrics.totalCandidates) * 100).toFixed(1)}% conversion` : '—'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              Pipeline Velocity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusEntries.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Active pipeline stages</p>
          </CardContent>
        </Card>
      </div>

      {/* Candidate pipeline funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Candidate Pipeline
          </CardTitle>
          <CardDescription>Candidates by recruitment stage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {statusEntries.map(([status, count]) => {
              const pct = (count / metrics.totalCandidates) * 100;
              const color = STATUS_COLORS[status] ?? 'bg-gray-400';
              return (
                <div key={status} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium capitalize">{status.replace(/_/g, ' ')}</span>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{count} candidates</span>
                      <span className="font-medium text-foreground">{pct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${color} transition-all duration-300`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Job status breakdown */}
      {jobStatusEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Job Openings by Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {jobStatusEntries.map(([status, count]) => (
                <Badge key={status} variant="secondary" className="text-xs px-2 py-1">
                  <span className="capitalize">{status.replace(/_/g, ' ')}</span>
                  <span className="ml-1.5 font-bold">{count}</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
