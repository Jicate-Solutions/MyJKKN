// hooks/staff/use-class-incharges.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClassInchargeFilters, AssignInchargeDto } from '@/types/staff';
import { ClassInchargeService } from '@/lib/services/staff/class-incharge-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// Query key factory
export const classInchargeKeys = {
  all: ['class-incharges'] as const,
  lists: () => [...classInchargeKeys.all, 'list'] as const,
  list: (filters: ClassInchargeFilters) => [...classInchargeKeys.lists(), filters] as const,
  bySection: (sectionId: string) =>
    [...classInchargeKeys.all, 'by-section', sectionId] as const,
};

/**
 * Fetch paginated sections with their embedded class incharges.
 * Requires institution_id to be set before enabling.
 */
export function useClassIncharges(filters: ClassInchargeFilters = {}) {
  return useQuery({
    queryKey: classInchargeKeys.list(filters),
    queryFn: () => ClassInchargeService.getSectionsWithIncharges(filters),
    enabled: !!filters.institution_id,
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch all incharges for a specific section (used inside the manage dialog).
 */
export function useInchargesBySection(sectionId: string | null) {
  return useQuery({
    queryKey: classInchargeKeys.bySection(sectionId || ''),
    queryFn: () => ClassInchargeService.getInchargesBySection(sectionId!),
    enabled: !!sectionId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Assign a staff member as class incharge.
 * Invalidates the list and the specific section's incharges after success.
 */
export function useAssignIncharge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: AssignInchargeDto) => ClassInchargeService.assignIncharge(dto),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: classInchargeKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: classInchargeKeys.bySection(variables.section_id),
      });
    },
  });
}

/**
 * Remove a class incharge assignment.
 * Requires sectionId to invalidate the section-specific cache after deletion.
 */
export function useRemoveIncharge(sectionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => ClassInchargeService.removeIncharge(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: classInchargeKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: classInchargeKeys.bySection(sectionId),
      });
    },
  });
}
