'use client';

/**
 * HR Intelligence — Tab 13: Bench Strength
 *
 * Succession readiness indicator: how many critical roles have
 * identified successors, what's the talent depth per department.
 * Queries staff for role/department distribution as a proxy.
 * Full succession planning (named successors per role) is a future feature.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  LineChart,
  AlertCircle,
  Users,
  Layers,
  ShieldCheck,
  UserPlus,
  BarChart3,
  Info,
} from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';

interface StaffRoleRow {
  id: string;
  institution_id: string;
  department_id: string | null;
  designation: string | null;
  employment_type: string | null;
}

function useBenchStrengthData() {
  return useQuery({
    queryKey: ['hr-intelligence', 'bench-strength'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('staff')
        .select('id, institution_id, department_id, designation, employment_type')
        .eq('is_active', true)
        .limit(2000);

      if (error) throw error;
      return (data ?? []) as StaffRoleRow[];
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function BenchStrengthTab() {
  const { data: staff, isLoading, isError } = useBenchStrengthData();
  const { institutions } = useInstitutionsWithAccess({ entityType: 'all' });

  const institutionNames = useMemo(() => {
    const map: Record<string, string> = {};
    institutions?.forEach((inst) => {
      map[inst.id] = inst.name;
    });
    return map;
  }, [institutions]);

  const metrics = useMemo(() => {
    if (!staff || staff.length === 0) return null;

    // Department depth: how many staff per department.
    // Staff with no department_id are NOT a department — they are counted
    // separately as `unassignedStaff` and surfaced as an explicit caveat, so a
    // data-completeness gap is never rendered as a real (or an at-risk) department.
    const deptCounts: Record<string, number> = {};
    const designationCounts: Record<string, number> = {};
    const byInstitution: Record<
      string,
      { total: number; departments: Set<string>; singlePersonDepts: number; unassigned: number }
    > = {};

    let unassignedStaff = 0;

    for (const s of staff) {
      const deptId = s.department_id || null;
      if (deptId) {
        deptCounts[deptId] = (deptCounts[deptId] ?? 0) + 1;
      } else {
        unassignedStaff += 1;
      }

      const designation = s.designation ?? 'Not Specified';
      designationCounts[designation] = (designationCounts[designation] ?? 0) + 1;

      const orgId = s.institution_id;
      if (!byInstitution[orgId]) {
        byInstitution[orgId] = { total: 0, departments: new Set(), singlePersonDepts: 0, unassigned: 0 };
      }
      byInstitution[orgId].total += 1;
      if (deptId) {
        byInstitution[orgId].departments.add(deptId);
      } else {
        byInstitution[orgId].unassigned += 1;
      }
    }

    // Single-person departments = bench strength risk
    const singlePersonDepts = Object.values(deptCounts).filter((c) => c === 1).length;
    const totalDepts = Object.keys(deptCounts).length;

    // Calculate per-institution single-person dept count (departments only)
    for (const orgId of Object.keys(byInstitution)) {
      const instStaff = staff.filter((s) => s.institution_id === orgId);
      const instDeptCounts: Record<string, number> = {};
      for (const s of instStaff) {
        const deptId = s.department_id || null;
        if (!deptId) continue;
        instDeptCounts[deptId] = (instDeptCounts[deptId] ?? 0) + 1;
      }
      byInstitution[orgId].singlePersonDepts = Object.values(instDeptCounts).filter((c) => c === 1).length;
    }

    // Top designations
    const topDesignations = Object.entries(designationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    return {
      totalStaff: staff.length,
      totalDepts,
      singlePersonDepts,
      unassignedStaff,
      benchStrengthScore: totalDepts > 0 ? (((totalDepts - singlePersonDepts) / totalDepts) * 100) : 0,
      topDesignations,
      byInstitution,
    };
  }, [staff]);

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
          Failed to load bench strength data.
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LineChart className="h-5 w-5" />
            Bench Strength
          </CardTitle>
          <CardDescription>
            Succession readiness and talent depth across departments and critical roles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg">
            <Layers className="h-12 w-12 mb-4 text-muted-foreground opacity-30" />
            <p className="text-sm font-medium text-muted-foreground">No Staff Data Available</p>
            <p className="text-xs mt-1 text-muted-foreground opacity-75 max-w-md text-center">
              Once staff records include department and designation data, this tab will show
              talent depth, single-point-of-failure roles, and succession readiness scores.
            </p>
            <Badge variant="outline" className="mt-4 text-xs">
              Requires: Active staff with department assignments
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasDepartmentData = metrics.totalDepts > 0;
  const scoreColor = !hasDepartmentData
    ? 'text-muted-foreground'
    : metrics.benchStrengthScore >= 80
      ? 'text-green-600'
      : metrics.benchStrengthScore >= 60
        ? 'text-amber-600'
        : 'text-red-600';

  return (
    <div className="space-y-4">
      {/* Summary stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              Bench Strength Score
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${scoreColor}`}>
              {hasDepartmentData ? `${metrics.benchStrengthScore.toFixed(0)}%` : '—'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {hasDepartmentData
                ? 'Departments with 2+ team members'
                : 'No record carries a department'}
            </p>
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
            <div className="text-2xl font-bold">{metrics.totalStaff}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across {metrics.totalDepts} departments
              {metrics.unassignedStaff > 0 && ` · ${metrics.unassignedStaff} in none`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-red-500" />
              Single-Person Depts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{metrics.singlePersonDepts}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.unassignedStaff > 0
                ? 'No backup coverage on record'
                : 'No backup coverage'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <UserPlus className="h-3.5 w-3.5" />
              Top Designation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold truncate">
              {metrics.topDesignations[0]?.[0] ?? '—'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.topDesignations[0]?.[1] ?? 0} staff
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Coverage caveat — only rendered when some staff carry no department */}
      {metrics.unassignedStaff > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">
              {metrics.unassignedStaff} of {metrics.totalStaff} active team members
            </span>{' '}
            are not attached to any department, so they are not counted in the figures on this tab.
            A department can therefore appear to have a single person because colleagues are
            unassigned rather than because no one else does that work.
          </p>
        </div>
      )}

      {/* Institution bench strength */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Institution Talent Depth
          </CardTitle>
          <CardDescription>Staff depth and single-point-of-failure risk per institution</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(metrics.byInstitution)
              .sort((a, b) => b[1].total - a[1].total)
              .map(([orgId, data]) => {
                const deptCount = data.departments.size;
                const riskDepts = data.singlePersonDepts;
                const hasDepts = deptCount > 0;
                const depthScore = hasDepts ? (((deptCount - riskDepts) / deptCount) * 100) : 0;
                const barColor = depthScore >= 80 ? 'bg-green-500' : depthScore >= 60 ? 'bg-amber-500' : 'bg-red-500';

                return (
                  <div key={orgId} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium truncate max-w-[50%]">
                        {institutionNames[orgId] ?? orgId.slice(0, 8)}
                      </span>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{data.total} staff</span>
                        <span>{deptCount} depts</span>
                        {data.unassigned > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                            {data.unassigned} unassigned
                          </Badge>
                        )}
                        {riskDepts > 0 && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                            {riskDepts} at risk
                          </Badge>
                        )}
                        <span className="font-medium text-foreground">
                          {hasDepts ? `${depthScore.toFixed(0)}%` : '—'}
                        </span>
                      </div>
                    </div>
                    {hasDepts ? (
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColor} transition-all duration-300`}
                          style={{ width: `${depthScore}%` }}
                        />
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        No departmental data — every active record here is unassigned.
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>

      {/* Top designations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Top Designations
          </CardTitle>
          <CardDescription>Most common roles across the workforce</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {metrics.topDesignations.map(([designation, count]) => {
              const pct = (count / metrics.totalStaff) * 100;
              return (
                <div key={designation} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate max-w-[60%]">{designation}</span>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{count} staff</span>
                      <span className="font-medium text-foreground">{pct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-500 transition-all duration-300"
                      style={{ width: `${pct}%` }}
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
