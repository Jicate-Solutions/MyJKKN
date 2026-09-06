'use client';

/**
 * HR Intelligence — Tab 6: Timesheet Summary
 *
 * Data source: hr_faculty_workload table.
 * Shows average weekly hours by institution, faculty count by workload band.
 * Stat cards for total faculty captured, average hours, highest/lowest.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, AlertCircle, Users, TrendingUp, TrendingDown } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';

interface WorkloadRow {
  id: string;
  staff_id: string;
  institution_id: string;
  academic_year: string;
  semester: number;
  weekly_contact_hours: number;
  weekly_admin_hours: number;
  weekly_research_hours: number;
}

function useWorkloadData() {
  return useQuery({
    queryKey: ['hr-intelligence', 'timesheet-summary'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hr_faculty_workload')
        .select('id, staff_id, institution_id, academic_year, semester, weekly_contact_hours, weekly_admin_hours, weekly_research_hours')
        .order('academic_year', { ascending: false })
        .limit(5000);

      if (error) throw error;
      return (data ?? []) as WorkloadRow[];
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

const BANDS = [
  { label: '<12h', min: 0, max: 12, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  { label: '12-16h', min: 12, max: 16, color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  { label: '16-20h', min: 16, max: 20, color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  { label: '>20h', min: 20, max: Infinity, color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
] as const;

function getBand(totalHours: number) {
  return BANDS.find((b) => totalHours >= b.min && totalHours < b.max) ?? BANDS[BANDS.length - 1];
}

export function TimesheetSummaryTab() {
  const { data: workloads, isLoading, isError } = useWorkloadData();
  const { institutions } = useInstitutionsWithAccess({ entityType: 'all' });

  const institutionNames = useMemo(() => {
    const map: Record<string, string> = {};
    institutions?.forEach((inst) => { map[inst.id] = inst.name; });
    return map;
  }, [institutions]);

  const analytics = useMemo(() => {
    if (!workloads || workloads.length === 0) return null;

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

    const instSummaries = Object.entries(byInst).map(([instId, d]) => ({
      instId,
      name: institutionNames[instId] ?? instId.slice(0, 8),
      avgHours: d.count > 0 ? d.totalHours / d.count : 0,
      facultyCount: d.faculty.size,
      recordCount: d.count,
    }));

    instSummaries.sort((a, b) => b.avgHours - a.avgHours);

    // Band distribution
    const bandCounts = BANDS.map((b) => ({
      ...b,
      count: workloads.filter((w) => {
        const total = Number(w.weekly_contact_hours) + Number(w.weekly_admin_hours ?? 0) + Number(w.weekly_research_hours ?? 0);
        return total >= b.min && total < b.max;
      }).length,
    }));

    // Global stats
    const allHours = workloads.map((w) =>
      Number(w.weekly_contact_hours) + Number(w.weekly_admin_hours ?? 0) + Number(w.weekly_research_hours ?? 0)
    );
    const globalAvg = allHours.reduce((a, b) => a + b, 0) / allHours.length;
    const highest = Math.max(...allHours);
    const lowest = Math.min(...allHours);
    const uniqueFaculty = new Set(workloads.map((w) => w.staff_id)).size;

    return { instSummaries, bandCounts, globalAvg, highest, lowest, uniqueFaculty, totalRecords: workloads.length };
  }, [workloads, institutionNames]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
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
          Failed to load workload data. The hr_faculty_workload table may not be populated.
        </CardContent>
      </Card>
    );
  }

  if (!analytics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Timesheet Summary
          </CardTitle>
          <CardDescription>
            Faculty workload hours — contact, admin, and research time by institution.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg">
            <Clock className="h-12 w-12 mb-4 text-muted-foreground opacity-30" />
            <p className="text-sm font-medium text-muted-foreground">No Workload Data Captured</p>
            <p className="text-xs mt-1 text-muted-foreground opacity-75 max-w-md text-center">
              Once faculty workload hours are entered via the HR workload module,
              this tab will show hours distribution by institution and workload bands.
            </p>
            <Badge variant="outline" className="mt-4 text-xs">
              Requires: hr_faculty_workload entries
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Faculty Captured
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.uniqueFaculty}</div>
            <p className="text-xs text-muted-foreground mt-1">{analytics.totalRecords} records</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Avg Weekly Hours
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.globalAvg.toFixed(1)}h</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              Highest
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.highest.toFixed(1)}h</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5" />
              Lowest
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.lowest.toFixed(1)}h</div>
          </CardContent>
        </Card>
      </div>

      {/* Workload band distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Workload Band Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {analytics.bandCounts.map((band) => (
              <div key={band.label} className={`rounded-lg p-4 text-center ${band.color}`}>
                <div className="text-2xl font-bold">{band.count}</div>
                <div className="text-xs font-medium mt-1">{band.label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Per-institution averages */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Average Hours by Institution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {analytics.instSummaries.map((inst) => {
              const maxAvg = Math.max(...analytics.instSummaries.map((i) => i.avgHours), 1);
              const barWidth = (inst.avgHours / maxAvg) * 100;
              const band = getBand(inst.avgHours);

              return (
                <div key={inst.instId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate max-w-[50%]">{inst.name}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground">{inst.facultyCount} faculty</span>
                      <Badge variant="outline" className={`text-[10px] ${band.color}`}>
                        {inst.avgHours.toFixed(1)}h
                      </Badge>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${barWidth}%` }}
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
