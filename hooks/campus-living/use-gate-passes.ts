'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GatePassService } from '@/lib/services/campus-living/gate-pass-service';
import type {
  CreateHostelGatePassDTO,
  GatePassStatus,
} from '@/types/campus-living';

// Filter type matching the service signature
interface GatePassFilters {
  status?: GatePassStatus;
  learner_id?: string;
  date?: string;
}

// Query key factory
export const gatePassKeys = {
  all: ['gate-passes'] as const,
  list: (filters: Record<string, unknown>) => ['gate-passes', 'list', filters] as const,
  detail: (id: string) => ['gate-passes', 'detail', id] as const,
  myPasses: (learnerId: string) => ['gate-passes', 'my-passes', learnerId] as const,
  activePasses: (learnerId: string) => ['gate-passes', 'active', learnerId] as const,
  pending: (institutionId: string) => ['gate-passes', 'pending', institutionId] as const,
  overdue: (institutionId: string) => ['gate-passes', 'overdue', institutionId] as const,
  childPasses: (parentUserId: string) => ['gate-passes', 'child-passes', parentUserId] as const,
};

// --- Query hooks ---

export function useGatePasses(institutionId: string, filters?: GatePassFilters) {
  return useQuery({
    queryKey: gatePassKeys.list({ institutionId, ...filters }),
    queryFn: () => GatePassService.getGatePasses(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useGatePass(id: string) {
  return useQuery({
    queryKey: gatePassKeys.detail(id),
    queryFn: () => GatePassService.getGatePass(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useIssueGatePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHostelGatePassDTO) => GatePassService.generateGatePass(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gatePassKeys.all });
      toast.success('Gate pass issued');
    },
    onError: (error: Error) => {
      toast.error(`Failed to issue gate pass: ${error.message}`);
    },
  });
}

export function useRecordExit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, securityId }: { id: string; securityId: string }) =>
      GatePassService.recordExit(id, securityId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: gatePassKeys.all });
      queryClient.invalidateQueries({ queryKey: gatePassKeys.detail(variables.id) });
      toast.success('Exit recorded');
    },
    onError: (error: Error) => {
      toast.error(`Failed to record exit: ${error.message}`);
    },
  });
}

export function useReturnGatePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, securityId }: { id: string; securityId: string }) =>
      GatePassService.recordReturn(id, securityId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: gatePassKeys.all });
      queryClient.invalidateQueries({ queryKey: gatePassKeys.detail(variables.id) });
      toast.success('Gate pass returned');
    },
    onError: (error: Error) => {
      toast.error(`Failed to return gate pass: ${error.message}`);
    },
  });
}

export function useUpdateGatePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateHostelGatePassDTO> }) =>
      GatePassService.updateGatePass(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: gatePassKeys.all });
      queryClient.invalidateQueries({ queryKey: gatePassKeys.detail(variables.id) });
      toast.success('Gate pass updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update gate pass: ${error.message}`);
    },
  });
}

export function useDeleteGatePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => GatePassService.deleteGatePass(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gatePassKeys.all });
      toast.success('Gate pass deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete gate pass: ${error.message}`);
    },
  });
}

// --- Overdue & active hooks ---

export function useOverduePasses(institutionId: string) {
  return useQuery({
    queryKey: gatePassKeys.overdue(institutionId),
    queryFn: () => GatePassService.getOverduePasses(institutionId),
    enabled: !!institutionId,
  });
}

export function useMarkOverdue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (institutionId: string) => GatePassService.markOverdue(institutionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gatePassKeys.all });
      toast.success('Overdue passes updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to mark overdue: ${error.message}`);
    },
  });
}

export function useActivePassesForLearner(learnerId: string) {
  return useQuery({
    queryKey: gatePassKeys.activePasses(learnerId),
    queryFn: () => GatePassService.getActivePassesForLearner(learnerId),
    enabled: !!learnerId,
  });
}

// --- Request workflow hooks ---

export function useMyGatePasses(learnerId: string) {
  return useQuery({
    queryKey: gatePassKeys.myPasses(learnerId),
    queryFn: () => GatePassService.getMyGatePasses(learnerId),
    enabled: !!learnerId,
  });
}

export function usePendingGatePassRequests(institutionId: string) {
  return useQuery({
    queryKey: gatePassKeys.pending(institutionId),
    queryFn: () => GatePassService.getPendingRequests(institutionId),
    enabled: !!institutionId,
  });
}

export function useRequestGatePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      institution_id: string;
      learner_id: string;
      pass_type: string;
      expected_return: string;
      destination: string;
      reason: string;
    }) => GatePassService.requestGatePass(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gatePassKeys.all });
      toast.success('Gate pass request submitted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to submit request: ${error.message}`);
    },
  });
}

export function useApproveGatePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approverId }: { id: string; approverId: string }) =>
      GatePassService.approveGatePass(id, approverId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: gatePassKeys.all });
      queryClient.invalidateQueries({ queryKey: gatePassKeys.detail(variables.id) });
      toast.success('Gate pass approved and issued');
    },
    onError: (error: Error) => {
      toast.error(`Failed to approve: ${error.message}`);
    },
  });
}

export function useRejectGatePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rejectedBy, reason }: { id: string; rejectedBy: string; reason: string }) =>
      GatePassService.rejectGatePass(id, rejectedBy, reason),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: gatePassKeys.all });
      queryClient.invalidateQueries({ queryKey: gatePassKeys.detail(variables.id) });
      toast.success('Gate pass request rejected');
    },
    onError: (error: Error) => {
      toast.error(`Failed to reject: ${error.message}`);
    },
  });
}

// --- Parent workflow hooks ---

export function useChildGatePasses(parentUserId: string) {
  return useQuery({
    queryKey: gatePassKeys.childPasses(parentUserId),
    queryFn: () => GatePassService.getChildGatePasses(parentUserId),
    enabled: !!parentUserId,
  });
}

export function useCancelGatePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cancelledBy, reason }: { id: string; cancelledBy: string; reason: string }) =>
      GatePassService.cancelGatePass(id, cancelledBy, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gatePassKeys.all });
      toast.success('Gate pass cancelled');
    },
    onError: (error: Error) => {
      toast.error(`Failed to cancel: ${error.message}`);
    },
  });
}

export function useConfirmReachedHome() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, parentUserId }: { id: string; parentUserId: string }) =>
      GatePassService.confirmReachedHome(id, parentUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gatePassKeys.all });
      toast.success('Confirmed: Child reached home safely');
    },
    onError: (error: Error) => {
      toast.error(`Failed to confirm: ${error.message}`);
    },
  });
}

export function useConfirmLeftHome() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, parentUserId }: { id: string; parentUserId: string }) =>
      GatePassService.confirmLeftHome(id, parentUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gatePassKeys.all });
      toast.success('Confirmed: Child left home heading to campus');
    },
    onError: (error: Error) => {
      toast.error(`Failed to confirm: ${error.message}`);
    },
  });
}
