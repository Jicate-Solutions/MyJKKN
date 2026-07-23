'use client';

/**
 * HR Intelligence — Tab 14: Cross-Institution Comparison
 *
 * Side-by-side view of key HR KPIs across JKKN's 8 institutions:
 * headcount, staff-to-student ratio, leave utilization, vacancy rate.
 * Pulls from staff, learners_profiles, and hr_leave_applications.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Building,
  AlertCircle,
  Users,
  GraduationCap,
  BarChart3,
  ArrowLeftRight,
} from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';

interface InstitutionMetrics {
  institutionId: string;
  staffCount: number;
  studentCount: number;
  staffStudentRatio: number;
}

function useCrossInstitutionData() {
  return useQuery({
    queryKey: ['hr-intelligence', 'cross-institution'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();

      // Get staff counts per institution
      const { data: staffData, error: staffErr } = await supabase
        .from('staff')
        .select('institution_id')
        .eq('is_active', true);

      if (staffErr) throw staffErr;

      // Get student/learner counts per institution
      const { data: learnerData, error: learnerErr } = await supabase
        .from('learners_profiles')
        .select('institution_id');

      if (learnerErr) throw learnerErr;

      return {
        staff: staffData ?? [],
        learners: learnerData ?? [],
      };
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function CrossInstitutionTab() {
  const { data, isLoading, isError } = useCrossInstitutionData();
  const { institutions } = useInstitutionsWithAccess({ entityType: 'all' });

  const institutionNames = useMemo(() => {
    const map: Record<string, string> = {};
    institutions?.forEach((inst) => {
      map[inst.id] = inst.name;
    });
    return map;
  }, [institutions]);

  const metrics = useMemo((): InstitutionMetrics[] | null => {
    if (!data) return null;

    const staffCounts: Record<string, number> = {};
    const studentCounts: Record<string, number> = {};

    for (const s of data.staff) {
      if (s.institution_id) {
        staffCounts[s.institution_id] = (staffCounts[s.institution_id] ?? 0) + 1;
      }
    }

    for (const l of data.learners) {
      if (l.institution_id) {
        studentCounts[l.institution_id] = (studentCounts[l.institution_id] ?? 0) + 1;
      }
    }

    const allOrgIds = new Set([...Object.keys(staffCounts), ...Object.keys(studentCounts)]);
    if (allOrgIds.size === 0) return null;

    return Array.from(allOrgIds)
      .map((orgId) => {
        const staffCount = staffCounts[orgId] ?? 0;
        const studentCount = studentCounts[orgId] ?? 0;
        return {
          institutionId: orgId,
          staffCount,
          studentCount,
          staffStudentRatio: studentCount > 0 ? staffCount / studentCount : 0,
        };
      })
      .sort((a, b) => b.staffCount - a.staffCount);
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
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
          Failed to load cross-institution data.
        </CardContent>
      </Card>
    );
  }

  if (!metrics || metrics.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="h-5 w-5" />
            Cross-Institution Comparison
          </CardTitle>
          <CardDescription>
            Side-by-side comparison of HR KPIs across all JKKN institutions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg">
            <ArrowLeftRight className="h-12 w-12 mb-4 text-muted-foreground opacity-30" />
            <p className="text-sm font-medium text-muted-foreground">No Cross-Institution Data</p>
            <p className="text-xs mt-1 text-muted-foreground opacity-75 max-w-md text-center">
              Once staff and learner records span multiple institutions, this tab will show
              headcount comparisons, staff-to-student ratios, and operational benchmarks.
            </p>
            <Badge variant="outline" className="mt-4 text-xs">
              Requires: Staff and learner data across institutions
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalStaff = metrics.reduce((sum, m) => sum + m.staffCount, 0);
  const totalStudents = metrics.reduce((sum, m) => sum + m.studentCount, 0);
  const maxStaff = Math.max(...metrics.map((m) => m.staffCount), 1);

  return (
    <div className="space-y-4">
      {/* Summary stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <Building className="h-3.5 w-3.5" />
              Institutions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.length}</div>
            <p className="text-xs text-muted-foreground mt-1">With active staff/learners</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Total Staff
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStaff}</div>
            <p className="text-xs text-muted-foreground mt-1">Avg {(totalStaff / metrics.length).toFixed(0)} per institution</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <GraduationCap className="h-3.5 w-3.5" />
              Total Learners
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStudents}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Overall ratio: 1:{totalStaff > 0 ? (totalStudents / totalStaff).toFixed(0) : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Institution comparison table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Headcount Comparison
          </CardTitle>
          <CardDescription>Staff and learner distribution per institution</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {metrics.map((m) => {
              const staffBarWidth = (m.staffCount / maxStaff) * 100;

              return (
                <div key={m.institutionId} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate max-w-[40%]">
                      {institutionNames[m.institutionId] ?? m.institutionId.slice(0, 8)}
                    </span>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {m.staffCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <GraduationCap className="h-3 w-3" />
                        {m.studentCount}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0"
                      >
                        1:{m.staffStudentRatio > 0 ? (1 / m.staffStudentRatio).toFixed(0) : '—'}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-1 h-2">
                    <div className="flex-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${staffBarWidth}%` }}
                      />
                    </div>
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
