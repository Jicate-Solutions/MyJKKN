'use client';

/**
 * HR Intelligence — Tab 7: Resource Utilization
 *
 * Data source: hr_faculty_workload + hr_regulatory_norms.
 * Compares actual workload hours against regulatory norms.
 * Traffic light: green (80-100%), amber (100-120% or <80%), red (>120%).
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Gauge, AlertCircle, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';

interface WorkloadRow {
  staff_id: string;
  institution_id: string;
  weekly_contact_hours: number;
  weekly_admin_hours: number;
  weekly_research_hours: number;
}

interface NormRow {
  id: string;
  body_id: string;
  program_type: string;
  sfr_norm_ratio: number;
  threshold_amber_pct: number;
  threshold_red_pct: number;
  is_active: boolean;
}

function useUtilizationData() {
  return useQuery({
    queryKey: ['hr-intelligence', 'resource-utilization'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();

      const [workloadResult, normsResult] = await Promise.all([
        supabase
          .from('hr_faculty_workload')
          .select('staff_id, institution_id, weekly_contact_hours, weekly_admin_hours, weekly_research_hours')
          .limit(5000),
        supabase
          .from('hr_regulatory_norms')
          .select('id, body_id, program_type, sfr_norm_ratio, threshold_amber_pct, threshold_red_pct, is_active')
          .eq('is_active', true)
          .limit(100),
      ]);

      if (workloadResult.error) throw workloadResult.error;

      return {
        workloads: (workloadResult.data ?? []) as WorkloadRow[],
        norms: (normsResult.data ?? []) as NormRow[],
      };
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// Default norm: 16 hours/week contact if no regulatory norm found
const DEFAULT_NORM_HOURS = 16;

function getTrafficLight(pct: number): {
  color: string;
  bg: string;
  label: string;
  icon: typeof CheckCircle2;
} {
  if (pct >= 80 && pct <= 100) {
    return { color: 'text-green-700', bg: 'bg-green-100 dark:bg-green-900/30', label: 'Optimal', icon: CheckCircle2 };
  }
  if ((pct > 100 && pct <= 120) || (pct >= 60 && pct < 80)) {
    return { color: 'text-amber-700', bg: 'bg-amber-100 dark:bg-amber-900/30', label: 'Attention', icon: AlertTriangle };
  }
  return { color: 'text-red-700', bg: 'bg-red-100 dark:bg-red-900/30', label: pct > 120 ? 'Overworked' : 'Underutilized', icon: XCircle };
}

export function ResourceUtilizationTab() {
  const { data, isLoading, isError } = useUtilizationData();
  const { institutions } = useInstitutionsWithAccess({ entityType: 'all' });

  const institutionNames = useMemo(() => {
    const map: Record<string, string> = {};
    institutions?.forEach((inst) => { map[inst.id] = inst.name; });
    return map;
  }, [institutions]);

  const utilization = useMemo(() => {
    if (!data || data.workloads.length === 0) return null;

    const { workloads, norms } = data;

    // Use first active norm's implied weekly norm, or default
    // norms table holds SFR ratio not weekly hours directly, so we use default
    const normHours = DEFAULT_NORM_HOURS;

    // Per-institution aggregation
    const byInst: Record<string, { totalHours: number; count: number; faculty: Set<string> }> = {};

    for (const w of workloads) {
      if (!byInst[w.institution_id]) {
        byInst[w.institution_id] = { totalHours: 0, count: 0, faculty: new Set() };
      }
      const total = Number(w.weekly_contact_hours) + Number(w.weekly_admin_hours ?? 0) + Number(w.weekly_research_hours ?? 0);
      byInst[w.institution_id].totalHours += total;
      byInst[w.institution_id].count += 1;
      byInst[w.institution_id].faculty.add(w.staff_id);
    }

    const instUtil = Object.entries(byInst).map(([instId, d]) => {
      const avgHours = d.count > 0 ? d.totalHours / d.count : 0;
      const pct = (avgHours / normHours) * 100;
      return {
        instId,
        name: institutionNames[instId] ?? instId.slice(0, 8),
        avgHours,
        normHours,
        utilizationPct: pct,
        facultyCount: d.faculty.size,
        traffic: getTrafficLight(pct),
      };
    });

    instUtil.sort((a, b) => b.utilizationPct - a.utilizationPct);

    // Count by traffic status
    const greenCount = instUtil.filter((i) => i.traffic.label === 'Optimal').length;
    const amberCount = instUtil.filter((i) => i.traffic.label === 'Attention').length;
    const redCount = instUtil.filter((i) => i.traffic.label === 'Overworked' || i.traffic.label === 'Underutilized').length;

    return { instUtil, greenCount, amberCount, redCount, normHours, hasNorms: norms.length > 0 };
  }, [data, institutionNames]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-20" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-24" /></CardContent>
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
          Failed to load utilization data.
        </CardContent>
      </Card>
    );
  }

  if (!utilization) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5" />
            Resource Utilization
          </CardTitle>
          <CardDescription>
            Compare actual faculty workload hours against regulatory norms.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg">
            <Gauge className="h-12 w-12 mb-4 text-muted-foreground opacity-30" />
            <p className="text-sm font-medium text-muted-foreground">No Workload Data Available</p>
            <p className="text-xs mt-1 text-muted-foreground opacity-75 max-w-md text-center">
              This tab compares actual teaching hours against regulatory norms to identify
              overworked or underutilized institutions.
            </p>
            <Badge variant="outline" className="mt-4 text-xs">
              Requires: hr_faculty_workload + hr_regulatory_norms
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              Optimal (80-100%)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{utilization.greenCount}</div>
            <p className="text-xs text-muted-foreground mt-1">institutions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              Needs Attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">{utilization.amberCount}</div>
            <p className="text-xs text-muted-foreground mt-1">institutions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <XCircle className="h-3.5 w-3.5 text-red-600" />
              Critical
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">{utilization.redCount}</div>
            <p className="text-xs text-muted-foreground mt-1">institutions</p>
          </CardContent>
        </Card>
      </div>

      {!utilization.hasNorms && (
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-900/10">
          <CardContent className="py-3 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 inline mr-1.5" />
            No active regulatory norms found. Using default norm of {utilization.normHours}h/week.
            Configure norms via the HR Regulatory Norms settings for accurate thresholds.
          </CardContent>
        </Card>
      )}

      {/* Utilization cards per institution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            Utilization by Institution
          </CardTitle>
          <CardDescription>
            Actual avg hours vs norm ({utilization.normHours}h/week). Green = 80-100%, Amber = 60-80% or 100-120%, Red = outside.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {utilization.instUtil.map((inst) => {
              const Icon = inst.traffic.icon;
              return (
                <div key={inst.instId} className={`rounded-lg p-4 ${inst.traffic.bg}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${inst.traffic.color}`} />
                      <span className="font-medium text-sm">{inst.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {inst.facultyCount} faculty
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] font-bold ${inst.traffic.color}`}>
                        {inst.utilizationPct.toFixed(0)}%
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Avg: {inst.avgHours.toFixed(1)}h/week</span>
                    <span>Norm: {inst.normHours}h/week</span>
                    <span className={inst.traffic.color}>{inst.traffic.label}</span>
                  </div>
                  {/* Utilization bar */}
                  <div className="mt-2 h-2 rounded-full bg-white/50 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        inst.utilizationPct > 120
                          ? 'bg-red-500'
                          : inst.utilizationPct > 100
                            ? 'bg-amber-500'
                            : inst.utilizationPct >= 80
                              ? 'bg-green-500'
                              : inst.utilizationPct >= 60
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(inst.utilizationPct, 150)}%`, maxWidth: '100%' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
