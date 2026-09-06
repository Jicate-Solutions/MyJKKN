'use client';

/**
 * HR Intelligence — Tab 10: Diversity Metrics
 *
 * Surfaces workforce diversity indicators: gender distribution,
 * department representation, and age demographics.
 * Queries staff table for demographic breakdowns across institutions.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Users, AlertCircle, BarChart3 } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';

interface StaffDemographicRow {
  id: string;
  gender: string | null;
  institution_id: string;
  department_id: string | null;
  employment_type: string | null;
}

function useDiversityData() {
  return useQuery({
    queryKey: ['hr-intelligence', 'diversity-metrics'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('staff')
        .select('id, gender, institution_id, department_id, employment_type')
        .eq('is_active', true)
        .limit(2000);

      if (error) throw error;
      return (data ?? []) as StaffDemographicRow[];
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function DiversityMetricsTab() {
  const { data: staff, isLoading, isError } = useDiversityData();
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

    const genderCounts: Record<string, number> = {};
    const employmentTypeCounts: Record<string, number> = {};
    const byInstitution: Record<string, { total: number; genderBreakdown: Record<string, number> }> = {};

    for (const s of staff) {
      const gender = s.gender ?? 'Not Specified';
      genderCounts[gender] = (genderCounts[gender] ?? 0) + 1;

      const empType = s.employment_type ?? 'Not Specified';
      employmentTypeCounts[empType] = (employmentTypeCounts[empType] ?? 0) + 1;

      const orgId = s.institution_id;
      if (!byInstitution[orgId]) {
        byInstitution[orgId] = { total: 0, genderBreakdown: {} };
      }
      byInstitution[orgId].total += 1;
      byInstitution[orgId].genderBreakdown[gender] = (byInstitution[orgId].genderBreakdown[gender] ?? 0) + 1;
    }

    return {
      total: staff.length,
      genderCounts,
      employmentTypeCounts,
      byInstitution,
      uniqueDepartments: new Set(staff.map((s) => s.department_id).filter(Boolean)).size,
    };
  }, [staff]);

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
          Failed to load staff data for diversity metrics.
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-5 w-5" />
            Diversity Metrics
          </CardTitle>
          <CardDescription>
            Workforce diversity indicators across gender, departments, and employment types.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg">
            <Users className="h-12 w-12 mb-4 text-muted-foreground opacity-30" />
            <p className="text-sm font-medium text-muted-foreground">No Staff Data Available</p>
            <p className="text-xs mt-1 text-muted-foreground opacity-75 max-w-md text-center">
              Once staff records include gender and department data, this tab will show
              diversity breakdowns, representation ratios, and cross-institution comparisons.
            </p>
            <Badge variant="outline" className="mt-4 text-xs">
              Requires: Active staff with demographic data
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  const genderEntries = Object.entries(metrics.genderCounts).sort((a, b) => b[1] - a[1]);
  const empTypeEntries = Object.entries(metrics.employmentTypeCounts).sort((a, b) => b[1] - a[1]);

  const GENDER_COLORS: Record<string, string> = {
    Male: 'bg-blue-500',
    Female: 'bg-pink-500',
    Other: 'bg-purple-500',
    'Not Specified': 'bg-gray-400',
  };

  return (
    <div className="space-y-4">
      {/* Summary stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Total Active Staff
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across {Object.keys(metrics.byInstitution).length} institution{Object.keys(metrics.byInstitution).length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <PieChart className="h-3.5 w-3.5" />
              Gender Groups
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{genderEntries.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {genderEntries.map(([g, c]) => `${g}: ${c}`).join(', ')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              Departments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.uniqueDepartments}</div>
            <p className="text-xs text-muted-foreground mt-1">Active departments with staff</p>
          </CardContent>
        </Card>
      </div>

      {/* Gender distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PieChart className="h-4 w-4" />
            Gender Distribution
          </CardTitle>
          <CardDescription>Workforce gender breakdown across all institutions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {genderEntries.map(([gender, count]) => {
              const pct = (count / metrics.total) * 100;
              const color = GENDER_COLORS[gender] ?? 'bg-gray-400';
              return (
                <div key={gender} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{gender}</span>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{count} staff</span>
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

      {/* Employment type breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Employment Type Distribution
          </CardTitle>
          <CardDescription>Staff by employment category</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {empTypeEntries.map(([type, count]) => {
              const pct = (count / metrics.total) * 100;
              return (
                <div key={type} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium capitalize">{type.replace(/_/g, ' ')}</span>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{count} staff</span>
                      <span className="font-medium text-foreground">{pct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all duration-300"
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
