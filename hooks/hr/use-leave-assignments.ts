'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { LeaveAssignmentService } from '@/lib/services/hr/leave-assignment-service';
import type { HRLeaveTypeAssignmentInsert } from '@/types/hr-leave-assignments';

const KEY = 'hr-leave-type-assignments';
const COVERAGE_KEY = 'hr-leave-type-coverage';

export function useLeaveTypeAssignments(leaveTypeId: string | undefined) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, leaveTypeId],
    queryFn: () => LeaveAssignmentService.listForType(supabase, leaveTypeId!),
    enabled: !!leaveTypeId,
  });
}

export function useLeaveTypeCoverage(leaveTypeId: string | undefined) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [COVERAGE_KEY, leaveTypeId],
    queryFn: () => LeaveAssignmentService.getCoverage(supabase, leaveTypeId!),
    enabled: !!leaveTypeId,
  });
}

/**
 * Every assignment mutation invalidates coverage as well as the list — the
 * whole point of the screen is that the reached-count reflects the rules, so
 * a stale count is worse than none.
 */
function useAssignmentMutation<TArgs>(
  fn: (supabase: ReturnType<typeof createClientSupabaseClient>, args: TArgs) => Promise<void>
) {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (args: TArgs) => fn(supabase, args),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: [COVERAGE_KEY] });
    },
  });
}

export function useCreateAssignments() {
  return useAssignmentMutation<HRLeaveTypeAssignmentInsert[]>((sb, rows) =>
    LeaveAssignmentService.create(sb, rows)
  );
}

export function useUpdateAssignmentEntitlement() {
  return useAssignmentMutation<{ id: string; entitledDays: number | null }>((sb, a) =>
    LeaveAssignmentService.updateEntitlement(sb, a.id, a.entitledDays)
  );
}

export function useRemoveAssignment() {
  return useAssignmentMutation<string>((sb, id) =>
    LeaveAssignmentService.remove(sb, id)
  );
}

export function useDepartmentsWithStaff(institutionId: string | undefined) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: ['hr-departments-with-staff', institutionId],
    queryFn: () => LeaveAssignmentService.listDepartments(supabase, institutionId!),
    enabled: !!institutionId,
  });
}

export function useStaffSearch(institutionId: string | undefined, term: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: ['hr-staff-search', institutionId, term],
    queryFn: () => LeaveAssignmentService.searchStaff(supabase, institutionId!, term),
    enabled: !!institutionId,
    // Keeps the list visible while a new term loads, so the picker does not
    // flash empty on every keystroke.
    placeholderData: (prev) => prev,
  });
}
