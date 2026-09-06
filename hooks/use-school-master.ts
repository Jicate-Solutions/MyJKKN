'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SchoolMasterService } from '@/lib/services/school-master-service';
import { queryKeys } from '@/lib/query/query-keys';
import type {
  SchoolMasterFilters,
  CreateSchoolMasterInput,
  UpdateSchoolMasterInput,
  SchoolMasterImportRow,
} from '@/types/school-master';

/** Districts that have active schools for a board (drives the District dropdown). */
export function useSchoolDistricts(board = 'state_board', enabled = true) {
  return useQuery({
    queryKey: queryKeys.schoolMaster.districts(board),
    queryFn: () => SchoolMasterService.getDistricts(board),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/** Server-side-searched schools for a board+district (drives the School combobox). */
export function useSchoolSearch(
  filters: SchoolMasterFilters,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.schoolMaster.list(filters),
    queryFn: () => SchoolMasterService.getSchools(filters),
    enabled: enabled && !!filters.district,
    staleTime: 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

/** Full list for the management page (no district requirement). */
export function useSchoolMasterList(filters: SchoolMasterFilters) {
  return useQuery({
    queryKey: queryKeys.schoolMaster.list(filters),
    queryFn: () => SchoolMasterService.getSchools(filters),
    placeholderData: (prev) => prev,
  });
}

export function useSchoolById(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.schoolMaster.detail(id ?? ''),
    queryFn: () => SchoolMasterService.getSchoolById(id as string),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

function useInvalidateSchoolMaster() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.schoolMaster.all });
}

export function useCreateSchool() {
  const invalidate = useInvalidateSchoolMaster();
  return useMutation({
    mutationFn: (input: CreateSchoolMasterInput) => SchoolMasterService.create(input),
    onSuccess: invalidate,
  });
}

export function useUpdateSchool() {
  const invalidate = useInvalidateSchoolMaster();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSchoolMasterInput }) =>
      SchoolMasterService.update(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteSchool() {
  const invalidate = useInvalidateSchoolMaster();
  return useMutation({
    mutationFn: (id: string) => SchoolMasterService.delete(id),
    onSuccess: invalidate,
  });
}

export function useBulkImportSchools() {
  const invalidate = useInvalidateSchoolMaster();
  return useMutation({
    mutationFn: ({ rows, board }: { rows: SchoolMasterImportRow[]; board?: string }) =>
      SchoolMasterService.bulkImport(rows, board),
    onSuccess: invalidate,
  });
}
