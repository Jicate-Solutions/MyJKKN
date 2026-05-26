'use client';

/**
 * HR Intelligence — Tab 4: Competency Matrix
 *
 * Data source: staff_specializations + hr_specializations + hr_staff_institution_allocation.
 * Shows grid — rows = specializations, columns = institutions, cells = faculty count.
 * Color-coded: green (≥3), amber (1-2), red (0).
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Target, AlertCircle } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';

interface SpecializationRow {
  id: string;
  specialization_id: string;
  staff_id: string;
}

interface SpecializationMaster {
  id: string;
  name: string;
  is_active: boolean;
}

interface AllocationRow {
  staff_id: string;
  institution_id: string;
}

function useCompetencyData() {
  return useQuery({
    queryKey: ['hr-intelligence', 'competency-matrix'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();

      const [specResult, masterResult, allocResult] = await Promise.all([
        supabase
          .from('staff_specializations')
          .select('id, specialization_id, staff_id')
          .limit(2000),
        supabase
          .from('hr_specializations')
          .select('id, name, is_active')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('hr_staff_institution_allocation')
          .select('staff_id, institution_id')
          .limit(5000),
      ]);

      if (specResult.error) throw specResult.error;
      if (masterResult.error) throw masterResult.error;

      return {
        specializations: (specResult.data ?? []) as SpecializationRow[],
        masters: (masterResult.data ?? []) as SpecializationMaster[],
        allocations: (allocResult.data ?? []) as AllocationRow[],
      };
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

function cellColor(count: number): string {
  if (count >= 3) return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
  if (count >= 1) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
  return 'bg-red-50 text-red-400 dark:bg-red-900/20 dark:text-red-400';
}

export function CompetencyMatrixTab() {
  const { data, isLoading, isError } = useCompetencyData();
  const { institutions } = useInstitutionsWithAccess({ entityType: 'all' });

  const matrix = useMemo(() => {
    if (!data || !institutions) return null;

    const { specializations, masters, allocations } = data;

    // Build staff → institution map from allocations
    const staffInstitution: Record<string, Set<string>> = {};
    for (const alloc of allocations) {
      if (!staffInstitution[alloc.staff_id]) staffInstitution[alloc.staff_id] = new Set();
      staffInstitution[alloc.staff_id].add(alloc.institution_id);
    }

    // Build specialization name lookup
    const specNames: Record<string, string> = {};
    for (const m of masters) specNames[m.id] = m.name;

    // Build matrix: spec_id → inst_id → count
    const grid: Record<string, Record<string, number>> = {};

    for (const row of specializations) {
      const specId = row.specialization_id;
      if (!specNames[specId]) continue;

      if (!grid[specId]) grid[specId] = {};

      const staffInsts = staffInstitution[row.staff_id];
      if (staffInsts) {
        for (const instId of staffInsts) {
          grid[specId][instId] = (grid[specId][instId] ?? 0) + 1;
        }
      }
    }

    // Get unique specialization IDs that have data
    const activeSpecIds = Object.keys(grid).filter((id) => specNames[id]);

    // Also include specs with zero assignments if masters exist
    for (const m of masters) {
      if (!grid[m.id]) {
        grid[m.id] = {};
        activeSpecIds.push(m.id);
      }
    }

    // De-duplicate
    const uniqueSpecIds = [...new Set(activeSpecIds)];
    uniqueSpecIds.sort((a, b) => (specNames[a] ?? '').localeCompare(specNames[b] ?? ''));

    return {
      specIds: uniqueSpecIds,
      specNames,
      grid,
      totalSpecializations: masters.length,
      totalAssignments: specializations.length,
    };
  }, [data, institutions]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Failed to load competency data. Tables may not be populated yet.
        </CardContent>
      </Card>
    );
  }

  const hasData = matrix && matrix.specIds.length > 0 && institutions && institutions.length > 0;

  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Competency Matrix
          </CardTitle>
          <CardDescription>
            Cross-institution specialization coverage — rows per specialization, columns per institution.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg">
            <Target className="h-12 w-12 mb-4 text-muted-foreground opacity-30" />
            <p className="text-sm font-medium text-muted-foreground">No Specialization Data Yet</p>
            <p className="text-xs mt-1 text-muted-foreground opacity-75 max-w-md text-center">
              Tag staff with specializations via the HR module and assign institution allocations
              to see the cross-institution competency matrix.
            </p>
            <Badge variant="outline" className="mt-4 text-xs">
              Requires: staff_specializations + hr_staff_institution_allocation
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Total Specializations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{matrix!.totalSpecializations}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Total Assignments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{matrix!.totalAssignments}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Institutions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{institutions!.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Matrix grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            Specialization × Institution Grid
          </CardTitle>
          <CardDescription>
            Cell color: <span className="text-green-600 font-medium">green ≥3</span>,{' '}
            <span className="text-amber-600 font-medium">amber 1-2</span>,{' '}
            <span className="text-red-400 font-medium">red 0</span> faculty.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px] text-xs">Specialization</TableHead>
                  {institutions!.map((inst) => (
                    <TableHead key={inst.id} className="text-xs text-center min-w-[80px]">
                      <span className="block truncate max-w-[100px]" title={inst.name}>
                        {inst.name.length > 12 ? `${inst.name.slice(0, 12)}...` : inst.name}
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrix!.specIds.map((specId) => (
                  <TableRow key={specId}>
                    <TableCell className="text-xs font-medium">
                      {matrix!.specNames[specId]}
                    </TableCell>
                    {institutions!.map((inst) => {
                      const count = matrix!.grid[specId]?.[inst.id] ?? 0;
                      return (
                        <TableCell key={inst.id} className="text-center p-1">
                          <span
                            className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-medium ${cellColor(count)}`}
                          >
                            {count}
                          </span>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
