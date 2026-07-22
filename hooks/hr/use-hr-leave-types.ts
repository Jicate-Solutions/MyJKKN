'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { HRLeaveTypeService } from '@/lib/services/hr/leave-type-service';
import type {
  HRLeaveTypeFilters,
  HRLeaveTypeInsert,
  HRLeaveTypeUpdate,
} from '@/types/hr-leave-types';

const KEY = 'hr-leave-types';

export function useHRLeaveTypes(filters: HRLeaveTypeFilters = {}) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, filters],
    queryFn: () => HRLeaveTypeService.list(supabase, filters),
  });
}

export function useCreateHRLeaveType() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (payload: HRLeaveTypeInsert) =>
      HRLeaveTypeService.create(supabase, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateHRLeaveType() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: HRLeaveTypeUpdate }) =>
      HRLeaveTypeService.update(supabase, id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteHRLeaveType() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (id: string) => HRLeaveTypeService.remove(supabase, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useGenerateBalances() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: ({
      hrOrgId,
      academicYearId,
      dryRun,
    }: {
      hrOrgId: string;
      academicYearId: string;
      dryRun: boolean;
    }) =>
      HRLeaveTypeService.generateBalances(supabase, hrOrgId, academicYearId, dryRun),
    onSuccess: (_data, vars) => {
      if (!vars.dryRun) {
        qc.invalidateQueries({ queryKey: ['hr-leave-balance'] });
      }
    },
  });
}
