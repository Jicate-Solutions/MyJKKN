'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HostelVacateRequestService } from '@/lib/services/campus-living/hostel-vacate-request-service';
import type {
  CreateVacateRequestDTO,
  VacateRequestFilters,
  HostelVacateDocument,
  VacateDamageLineInput,
} from '@/types/hostel-vacate';

export const hostelVacateKeys = {
  all: ['hostel-vacate'] as const,
  list: (institutionId: string, filters?: VacateRequestFilters) =>
    ['hostel-vacate', 'list', institutionId, filters] as const,
  detail: (id: string) => ['hostel-vacate', 'detail', id] as const,
  bills: (id: string) => ['hostel-vacate', 'bills', id] as const,
  learner: (profileId: string) => ['hostel-vacate', 'learner', profileId] as const,
  fineBill: (billId: string) => ['hostel-vacate', 'fine-bill', billId] as const,
  myRequests: (userId: string) => ['hostel-vacate', 'mine', userId] as const,
};

// --- Query hooks ---

export function useVacateRequests(institutionId: string, filters?: VacateRequestFilters) {
  return useQuery({
    queryKey: hostelVacateKeys.list(institutionId, filters),
    queryFn: () => HostelVacateRequestService.getRequests(institutionId || undefined, filters),
  });
}

export function useVacateRequest(id: string) {
  return useQuery({
    queryKey: hostelVacateKeys.detail(id),
    queryFn: () => HostelVacateRequestService.getRequest(id),
    enabled: !!id,
  });
}

export function useMyVacateRequests(userId: string | undefined) {
  return useQuery({
    queryKey: hostelVacateKeys.myRequests(userId ?? ''),
    queryFn: () => HostelVacateRequestService.getMyRequests(userId!),
    enabled: !!userId,
  });
}

/** Every hostel/mess bill (all years) + outstanding total for the request's learner. */
export function useVacateBillStatus(requestId: string, enabled = true) {
  return useQuery({
    queryKey: hostelVacateKeys.bills(requestId),
    queryFn: () => HostelVacateRequestService.getBillStatus(requestId),
    enabled: !!requestId && enabled,
  });
}

/** Full learner record (programme, contacts, parents, room categories) for the detail page. */
export function useVacateLearnerDetails(profileId: string | null | undefined) {
  return useQuery({
    queryKey: hostelVacateKeys.learner(profileId ?? ''),
    queryFn: () => HostelVacateRequestService.getLearnerDetails(profileId!),
    enabled: !!profileId,
  });
}

/** Approver names for the decision timeline. */
export function useVacateActorNames(ids: string[]) {
  const key = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ['hostel-vacate', 'actors', key] as const,
    queryFn: () => HostelVacateRequestService.getActorNames(key),
    enabled: key.length > 0,
  });
}

/** The damage-fine bill (raised at CAO approval); polled lightly while it is unpaid. */
export function useVacateFineBill(billId: string | null | undefined) {
  return useQuery({
    queryKey: hostelVacateKeys.fineBill(billId ?? ''),
    queryFn: () => HostelVacateRequestService.getFineBill(billId!),
    enabled: !!billId,
  });
}

// --- Mutation hooks ---

export function useCreateVacateDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateVacateRequestDTO) => HostelVacateRequestService.createDraft(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.all });
    },
    onError: (error: Error) => {
      toast.error(`Failed to create request: ${error.message}`);
    },
  });
}

export function useSubmitVacateDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => HostelVacateRequestService.submitDraft(requestId),
    onSuccess: (_data, requestId) => {
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.detail(requestId) });
      // Submit moves the allocation to pending_vacate.
      queryClient.invalidateQueries({ queryKey: ['my-hostel'] });
      queryClient.invalidateQueries({ queryKey: ['hostel-allocations'] });
      toast.success('Vacate request submitted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to submit: ${error.message}`);
    },
  });
}

/** Tick / untick one line of the request's checklist (optionally with a remark). */
export function useSetChecklistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      cleared,
      notes,
    }: {
      itemId: string;
      requestId: string;
      cleared: boolean;
      notes: string | null;
    }) => HostelVacateRequestService.setChecklistItem(itemId, cleared, notes),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.detail(variables.requestId) });
    },
    onError: (error: Error) => {
      toast.error(`Failed: ${error.message}`);
    },
  });
}

/** Beds, allocations, the learner's accommodation type and categories all change on completion. */
const COMPLETION_KEYS = [
  'hostel-allocations',
  'hostel-rooms',
  'hostel-beds',
  'hostel-blocks',
  'hostel-residents',
  'learner-hostelites',
  'my-hostel',
];

/**
 * Approve the step the request is at (principal / warden / mess / CAO). The CAO
 * step either completes the vacate or raises the damage-fine bill, so billing
 * caches are refreshed as well as the occupancy ones.
 */
export function useAdvanceVacate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, remarks }: { requestId: string; remarks?: string | null }) =>
      HostelVacateRequestService.advance(requestId, remarks),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.detail(variables.requestId) });
      for (const key of [...COMPLETION_KEYS, 'billing-bills', 'student-bills']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      if (result.status === 'completed') {
        toast.success('Approved — learner vacated and moved to Day Scholar');
      } else if (result.status === 'pending_fine') {
        toast.success('Approved — damage fine bill raised; the vacate completes once it is paid');
      } else {
        toast.success('Approved — moved to the next step');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/** Step 1 refresh: re-reads the bills and moves the request on if they are all settled. */
export function useRecheckVacateBills() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => HostelVacateRequestService.recheckBills(requestId),
    onSuccess: (result, requestId) => {
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.detail(requestId) });
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.bills(requestId) });
      if (result.advanced) toast.success('All bills are cleared — sent to the Principal');
      else toast.info('Bills are still outstanding');
    },
    onError: (error: Error) => {
      toast.error(`Failed to re-check bills: ${error.message}`);
    },
  });
}

/** Warden's room inspection: damage lines, or an explicit "no damage". */
export function useSetVacateDamages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      requestId,
      lines,
      noDamage,
    }: {
      requestId: string;
      lines: VacateDamageLineInput[];
      noDamage: boolean;
    }) => HostelVacateRequestService.setDamages(requestId, lines, noDamage),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.detail(variables.requestId) });
      toast.success('Room inspection saved');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/** Retry completion when the fine was settled but the automatic completion did not run. */
export function useCompleteVacateAfterFine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => HostelVacateRequestService.completeAfterFine(requestId),
    onSuccess: (_data, requestId) => {
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.detail(requestId) });
      for (const key of COMPLETION_KEYS) queryClient.invalidateQueries({ queryKey: [key] });
      toast.success('Vacate completed');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useRejectVacate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason: string }) =>
      HostelVacateRequestService.reject(requestId, reason),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.detail(variables.requestId) });
      queryClient.invalidateQueries({ queryKey: ['hostel-allocations'] });
      queryClient.invalidateQueries({ queryKey: ['my-hostel'] });
      toast.success('Request rejected');
    },
    onError: (error: Error) => {
      toast.error(`Failed to reject: ${error.message}`);
    },
  });
}

export function useCancelVacate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason: string }) =>
      HostelVacateRequestService.cancel(requestId, reason),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.detail(variables.requestId) });
      queryClient.invalidateQueries({ queryKey: ['hostel-allocations'] });
      queryClient.invalidateQueries({ queryKey: ['my-hostel'] });
      toast.success('Request cancelled');
    },
    onError: (error: Error) => {
      toast.error(`Failed to cancel: ${error.message}`);
    },
  });
}

export function useCreateVacateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof HostelVacateRequestService.createDocument>[0]) =>
      HostelVacateRequestService.createDocument(payload),
    onSuccess: (data: HostelVacateDocument) => {
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.detail(data.vacate_request_id) });
      toast.success('Document uploaded');
    },
    onError: (error: Error) => {
      toast.error(`Upload failed: ${error.message}`);
    },
  });
}

export function useDeleteVacateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => HostelVacateRequestService.deleteDocument(documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelVacateKeys.all });
      toast.success('Document removed');
    },
    onError: (error: Error) => {
      toast.error(`Remove failed: ${error.message}`);
    },
  });
}
