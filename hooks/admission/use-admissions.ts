import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Admission,
  AdmissionFilters,
  AdmissionListResponse,
  CreateAdmissionDto,
  UpdateAdmissionDto
} from '@/types/admission';
import { AdmissionService } from '@/lib/services/admission/admission-service';

export type AdmissionData = Admission;

// Query key factory for admissions
export const admissionKeys = {
  all: ['admissions'] as const,
  lists: () => [...admissionKeys.all, 'list'] as const,
  list: (filters: AdmissionFilters) =>
    [...admissionKeys.lists(), filters] as const,
  details: () => [...admissionKeys.all, 'detail'] as const,
  detail: (id: string) => [...admissionKeys.details(), id] as const,
  stats: () => [...admissionKeys.all, 'stats'] as const
};

// Get a list of admissions with filters
export const useAdmissions = (filters: AdmissionFilters = {}) => {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: admissionKeys.list(filters),
    queryFn: () => AdmissionService.getAdmissions(filters),
    placeholderData: () => {
      // Find the closest matching data from the cache
      return queryClient.getQueryData(admissionKeys.lists());
    }
  });
};

// Get a single admission by ID
export const useAdmission = (id: string) => {
  return useQuery({
    queryKey: admissionKeys.detail(id),
    queryFn: () => AdmissionService.getAdmission(id),
    enabled: !!id
  });
};

// Create a new admission
export const useCreateAdmission = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAdmissionDto) =>
      AdmissionService.createAdmission(data),
    onSuccess: () => {
      // Invalidate all admission-related queries
      queryClient.invalidateQueries({ queryKey: admissionKeys.all });
      // Also remove all cached data to force fresh fetch
      queryClient.removeQueries({ queryKey: admissionKeys.lists() });
    }
  });
};

// Create admission from draft (convert draft to final)
export const useCreateAdmissionFromDraft = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ draftId, data }: { draftId: string; data: CreateAdmissionDto }) =>
      AdmissionService.createAdmissionFromDraft(draftId, data),
    onSuccess: () => {
      // Invalidate all admission-related queries
      queryClient.invalidateQueries({ queryKey: admissionKeys.all });
      // Also remove all cached data to force fresh fetch
      queryClient.removeQueries({ queryKey: admissionKeys.lists() });
    }
  });
};

// Update an existing admission
export const useUpdateAdmission = (id: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateAdmissionDto) =>
      AdmissionService.updateAdmission(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: admissionKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: admissionKeys.lists() });
      queryClient.setQueryData(admissionKeys.detail(id), data);
    }
  });
};

// Update admission status
export const useUpdateAdmissionStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      AdmissionService.updateAdmissionStatus(id, status),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: admissionKeys.detail(variables.id)
      });
      queryClient.invalidateQueries({ queryKey: admissionKeys.lists() });
      queryClient.invalidateQueries({ queryKey: admissionKeys.stats() });
      queryClient.setQueryData(admissionKeys.detail(variables.id), data);
    }
  });
};

// Delete an admission
export const useDeleteAdmission = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => AdmissionService.deleteAdmission(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: admissionKeys.lists() });
      queryClient.invalidateQueries({ queryKey: admissionKeys.stats() });
      queryClient.removeQueries({ queryKey: admissionKeys.detail(id) });
    }
  });
};

// Bulk delete admissions
export const useBulkDeleteAdmissions = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => AdmissionService.bulkDeleteAdmissions(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: admissionKeys.lists() });
      queryClient.invalidateQueries({ queryKey: admissionKeys.stats() });
    }
  });
};

// Get admission statistics
export const useAdmissionStats = () => {
  return useQuery({
    queryKey: admissionKeys.stats(),
    queryFn: () => AdmissionService.getAdmissionStats()
  });
};

// Save draft admission
export const useSaveDraftAdmission = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<CreateAdmissionDto>) =>
      AdmissionService.saveDraftAdmission(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: admissionKeys.all });
      queryClient.removeQueries({ queryKey: admissionKeys.lists() });
    }
  });
};

// Update draft admission
export const useUpdateDraftAdmission = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateAdmissionDto> }) =>
      AdmissionService.updateDraftAdmission(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: admissionKeys.detail(variables.id)
      });
      queryClient.invalidateQueries({ queryKey: admissionKeys.lists() });
    }
  });
};
