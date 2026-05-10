'use client';

/**
 * HR Shifts hooks (T1.6 Phase 2a)
 *
 * React Query wrappers around ShiftService. Used by:
 *   - app/(routes)/hr/shifts/my/page.tsx (employee read-only view)
 *
 * The two policy-shell pages (admin/hr/shift-templates, hr/shifts) call the
 * service directly inside onLoad/onSave handlers, mirroring the
 * recruitment-jobs/page.tsx pattern. These hooks exist so non-policy-shell
 * surfaces (employee dashboard, future widgets) can subscribe to shift data
 * without re-implementing the service plumbing.
 *
 * Spec: specs/hr-module-decomposition-2026-05-09.md (T1.6 Phase 2a)
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ShiftService } from '@/lib/services/hr/shift-service';
import type {
  HRShiftAssignmentInsert,
  HRShiftAssignmentUpdate,
  HRShiftTemplateInsert,
  HRShiftTemplateUpdate,
  ShiftAssignmentFilters,
  ShiftTemplateFilters,
} from '@/types/hr-shifts';

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function useShiftTemplates(filters: ShiftTemplateFilters = {}) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: ['hr-shift-templates', filters],
    queryFn: () => ShiftService.listTemplates(supabase, filters),
  });
}

export function useCreateShiftTemplate() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (payload: HRShiftTemplateInsert) =>
      ShiftService.createTemplate(supabase, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-shift-templates'] });
    },
  });
}

export function useUpdateShiftTemplate() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: HRShiftTemplateUpdate }) =>
      ShiftService.updateTemplate(supabase, id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-shift-templates'] });
    },
  });
}

export function useDeleteShiftTemplate() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (id: string) => ShiftService.deleteTemplate(supabase, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-shift-templates'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

/**
 * Active shift assignment for one staff member, with effective hours
 * computed (template + override). Powers the /hr/shifts/my employee view.
 */
export function useShiftAssignment(staffId: string | undefined) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: ['hr-shift-assignment', staffId],
    queryFn: () => ShiftService.getMyShiftAssignment(supabase, staffId as string),
    enabled: !!staffId,
  });
}

/**
 * HR officer / admin listing.
 */
export function useShiftAssignments(filters: ShiftAssignmentFilters = {}) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: ['hr-shift-assignments', filters],
    queryFn: () => ShiftService.listAssignmentsForInstitution(supabase, filters),
  });
}

export function useAssignShift() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (payload: HRShiftAssignmentInsert) =>
      ShiftService.assignShift(supabase, payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hr-shift-assignments'] });
      qc.invalidateQueries({ queryKey: ['hr-shift-assignment', data.staff_id] });
    },
  });
}

export function useUpdateShiftAssignment() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: HRShiftAssignmentUpdate }) =>
      ShiftService.updateAssignment(supabase, id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-shift-assignments'] });
      qc.invalidateQueries({ queryKey: ['hr-shift-assignment'] });
    },
  });
}

export function useDeleteShiftAssignment() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (id: string) => ShiftService.deleteAssignment(supabase, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-shift-assignments'] });
      qc.invalidateQueries({ queryKey: ['hr-shift-assignment'] });
    },
  });
}
