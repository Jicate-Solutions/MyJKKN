import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { queryKeys } from '@/lib/query/query-keys';
import { ScholarshipSetupService } from '@/lib/services/billing/discounts/scholarship-setup-service';
import type {
  CreateScholarshipCategoryDto,
  CreateScholarshipTypeDto,
  UpdateScholarshipCategoryDto,
  UpdateScholarshipTypeDto
} from '@/types/billing-schedule';

/** Every category with its types (inactive included — callers filter). */
export function useScholarshipSetup() {
  return useQuery({
    queryKey: queryKeys.scholarshipSetup.tree(),
    queryFn: () => ScholarshipSetupService.listCategoriesWithTypes()
  });
}

// Nothing in this app self-refreshes, so every mutation invalidates the setup
// tree (all the dropdowns) AND the discount lists (names are embedded there).
function useInvalidateScholarshipSetup() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.scholarshipSetup.all });
    queryClient.invalidateQueries({ queryKey: ['billing-discounts'] });
    queryClient.invalidateQueries({ queryKey: ['billing-discount'] });
  };
}

export function useCreateScholarshipCategory() {
  const invalidate = useInvalidateScholarshipSetup();
  return useMutation({
    mutationFn: (dto: CreateScholarshipCategoryDto) =>
      ScholarshipSetupService.createCategory(dto),
    onSuccess: () => {
      invalidate();
      toast.success('Category created');
    },
    onError: (error: Error) => toast.error(error.message)
  });
}

export function useUpdateScholarshipCategory() {
  const invalidate = useInvalidateScholarshipSetup();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateScholarshipCategoryDto }) =>
      ScholarshipSetupService.updateCategory(id, data),
    onSuccess: () => {
      invalidate();
      toast.success('Category updated');
    },
    onError: (error: Error) => toast.error(error.message)
  });
}

export function useDeleteScholarshipCategory() {
  const invalidate = useInvalidateScholarshipSetup();
  return useMutation({
    mutationFn: (id: string) => ScholarshipSetupService.deleteCategory(id),
    onSuccess: () => {
      invalidate();
      toast.success('Category deleted');
    },
    onError: (error: Error) => toast.error(error.message)
  });
}

export function useCreateScholarshipType() {
  const invalidate = useInvalidateScholarshipSetup();
  return useMutation({
    mutationFn: (dto: CreateScholarshipTypeDto) => ScholarshipSetupService.createType(dto),
    onSuccess: () => {
      invalidate();
      toast.success('Type created');
    },
    onError: (error: Error) => toast.error(error.message)
  });
}

export function useUpdateScholarshipType() {
  const invalidate = useInvalidateScholarshipSetup();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateScholarshipTypeDto }) =>
      ScholarshipSetupService.updateType(id, data),
    onSuccess: () => {
      invalidate();
      toast.success('Type updated');
    },
    onError: (error: Error) => toast.error(error.message)
  });
}

export function useDeleteScholarshipType() {
  const invalidate = useInvalidateScholarshipSetup();
  return useMutation({
    mutationFn: (id: string) => ScholarshipSetupService.deleteType(id),
    onSuccess: () => {
      invalidate();
      toast.success('Type deleted');
    },
    onError: (error: Error) => toast.error(error.message)
  });
}
