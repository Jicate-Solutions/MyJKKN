'use client';

/**
 * HR Intelligence — Tab 5: Skills Matrix
 *
 * Data source: staff_specializations + hr_specializations + hr_staff_institution_allocation.
 * Individual staff view grouped by institution with specialization badges.
 * Includes filter by specialization, institution, and "untagged" staff.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Award, AlertCircle, UserX, Filter } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';

interface StaffWithSpecs {
  staff_id: string;
  staff_name: string;
  institution_id: string;
  specializations: { id: string; name: string }[];
}

interface SpecMaster {
  id: string;
  name: string;
}

function useSkillsData() {
  return useQuery({
    queryKey: ['hr-intelligence', 'skills-matrix'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();

      const [specResult, masterResult, allocResult, staffResult] = await Promise.all([
        supabase
          .from('staff_specializations')
          .select('staff_id, specialization_id')
          .limit(5000),
        supabase
          .from('hr_specializations')
          .select('id, name')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('hr_staff_institution_allocation')
          .select('staff_id, institution_id')
          .limit(5000),
        supabase
          .from('staff')
          .select('id, first_name, last_name')
          .eq('is_active', true)
          .limit(5000),
      ]);

      if (specResult.error) throw specResult.error;
      if (masterResult.error) throw masterResult.error;

      return {
        specs: (specResult.data ?? []) as { staff_id: string; specialization_id: string }[],
        masters: (masterResult.data ?? []) as SpecMaster[],
        allocations: (allocResult.data ?? []) as { staff_id: string; institution_id: string }[],
        staffList: (staffResult.data ?? []) as { id: string; first_name: string; last_name: string }[],
      };
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function SkillsMatrixTab() {
  const { data, isLoading, isError } = useSkillsData();
  const { institutions } = useInstitutionsWithAccess({ entityType: 'all' });
  const [institutionFilter, setInstitutionFilter] = useState<string>('all');
  const [specFilter, setSpecFilter] = useState<string>('all');
  const [showUntagged, setShowUntagged] = useState(false);

  const { staffWithSpecs, untaggedCount, masters } = useMemo(() => {
    if (!data || !institutions) return { staffWithSpecs: [], untaggedCount: 0, masters: [] };

    const { specs, masters, allocations, staffList } = data;

    // Build spec name lookup
    const specNames: Record<string, string> = {};
    for (const m of masters) specNames[m.id] = m.name;

    // Build staff → institution map
    const staffInst: Record<string, string> = {};
    for (const alloc of allocations) {
      staffInst[alloc.staff_id] = alloc.institution_id;
    }

    // Build staff name lookup
    const staffNames: Record<string, string> = {};
    for (const s of staffList) {
      staffNames[s.id] = `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || s.id.slice(0, 8);
    }

    // Build staff → specializations map
    const staffSpecs: Record<string, { id: string; name: string }[]> = {};
    for (const row of specs) {
      if (!specNames[row.specialization_id]) continue;
      if (!staffSpecs[row.staff_id]) staffSpecs[row.staff_id] = [];
      staffSpecs[row.staff_id].push({ id: row.specialization_id, name: specNames[row.specialization_id] });
    }

    // Merge into StaffWithSpecs
    const allStaffIds = new Set([
      ...Object.keys(staffInst),
      ...Object.keys(staffSpecs),
    ]);

    const result: StaffWithSpecs[] = [];
    let untagged = 0;

    for (const sid of allStaffIds) {
      const instId = staffInst[sid];
      if (!instId) continue;

      const specList = staffSpecs[sid] ?? [];
      if (specList.length === 0) untagged++;

      result.push({
        staff_id: sid,
        staff_name: staffNames[sid] ?? sid.slice(0, 8),
        institution_id: instId,
        specializations: specList,
      });
    }

    result.sort((a, b) => a.staff_name.localeCompare(b.staff_name));

    return { staffWithSpecs: result, untaggedCount: untagged, masters };
  }, [data, institutions]);

  const filtered = useMemo(() => {
    let list = staffWithSpecs;

    if (institutionFilter !== 'all') {
      list = list.filter((s) => s.institution_id === institutionFilter);
    }

    if (showUntagged) {
      list = list.filter((s) => s.specializations.length === 0);
    } else if (specFilter !== 'all') {
      list = list.filter((s) => s.specializations.some((sp) => sp.id === specFilter));
    }

    return list;
  }, [staffWithSpecs, institutionFilter, specFilter, showUntagged]);

  const institutionNames = useMemo(() => {
    const map: Record<string, string> = {};
    institutions?.forEach((inst) => { map[inst.id] = inst.name; });
    return map;
  }, [institutions]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56 mt-2" />
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
          Failed to load skills data.
        </CardContent>
      </Card>
    );
  }

  if (staffWithSpecs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            Skills Matrix
          </CardTitle>
          <CardDescription>
            Individual staff view with specialization badges, grouped by institution.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg">
            <Award className="h-12 w-12 mb-4 text-muted-foreground opacity-30" />
            <p className="text-sm font-medium text-muted-foreground">No Staff Allocation Data</p>
            <p className="text-xs mt-1 text-muted-foreground opacity-75 max-w-md text-center">
              Assign staff to institutions and tag their specializations to populate this view.
            </p>
            <Badge variant="outline" className="mt-4 text-xs">
              Requires: hr_staff_institution_allocation + staff_specializations
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group filtered by institution
  const grouped: Record<string, StaffWithSpecs[]> = {};
  for (const s of filtered) {
    if (!grouped[s.institution_id]) grouped[s.institution_id] = [];
    grouped[s.institution_id].push(s);
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="h-4 w-4" />
            Skills Matrix — Staff Specializations
          </CardTitle>
          <CardDescription>
            {staffWithSpecs.length} staff with allocations | {untaggedCount} untagged
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={institutionFilter} onValueChange={setInstitutionFilter}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue placeholder="All Institutions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Institutions</SelectItem>
                {institutions?.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={showUntagged ? 'untagged' : specFilter}
              onValueChange={(v) => {
                if (v === 'untagged') {
                  setShowUntagged(true);
                  setSpecFilter('all');
                } else {
                  setShowUntagged(false);
                  setSpecFilter(v);
                }
              }}
            >
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue placeholder="All Specializations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Specializations</SelectItem>
                <SelectItem value="untagged">
                  <span className="flex items-center gap-1.5">
                    <UserX className="h-3 w-3" />
                    Untagged Only ({untaggedCount})
                  </span>
                </SelectItem>
                {masters.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Badge variant="secondary" className="text-xs">
              <Filter className="h-3 w-3 mr-1" />
              {filtered.length} staff
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Grouped staff list */}
      {Object.entries(grouped).map(([instId, staffList]) => (
        <Card key={instId}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {institutionNames[instId] ?? instId.slice(0, 8)}
              <Badge variant="outline" className="ml-2 text-[10px]">{staffList.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {staffList.map((staff) => (
                <div
                  key={staff.staff_id}
                  className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 text-sm"
                >
                  <span className="font-medium truncate max-w-[40%]">{staff.staff_name}</span>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {staff.specializations.length === 0 ? (
                      <Badge variant="outline" className="text-[10px] text-red-500 border-red-200">
                        Untagged
                      </Badge>
                    ) : (
                      staff.specializations.map((sp) => (
                        <Badge key={sp.id} variant="secondary" className="text-[10px]">
                          {sp.name}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {filtered.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No staff match the selected filters.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
