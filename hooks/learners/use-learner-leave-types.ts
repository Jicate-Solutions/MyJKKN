import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { LearnerLeaveTypeService } from '@/lib/services/learners/learner-leave-type-service';
import type { LeaveOndutyCategory } from '@/types/leave-onduty';
import type {
  LearnerLeaveFlowStep,
  LearnerLeaveResidency,
  LearnerLeaveTypeFilters,
  LearnerLeaveTypeInput,
} from '@/types/learner-leave-types';

export const LEARNER_LEAVE_TYPE_KEYS = {
  all: ['learner-leave-types'] as const,
  list: (filters: LearnerLeaveTypeFilters) => ['learner-leave-types', 'list', filters] as const,
  eligible: (residency: string, category: string) =>
    ['learner-leave-types', 'eligible', residency, category] as const,
  residency: (learnerId: string) => ['learner-leave-types', 'residency', learnerId] as const,
  flows: (leaveTypeId: string) => ['learner-leave-types', 'flows', leaveTypeId] as const,
  roles: ['learner-leave-types', 'approval-roles'] as const,
};

export function useLearnerLeaveTypes(filters: LearnerLeaveTypeFilters = {}) {
  return useQuery({
    queryKey: LEARNER_LEAVE_TYPE_KEYS.list(filters),
    queryFn: () => LearnerLeaveTypeService.listTypes(filters),
    staleTime: 60_000,
  });
}

export function useLearnerResidency(learnerId: string | null | undefined) {
  return useQuery({
    queryKey: LEARNER_LEAVE_TYPE_KEYS.residency(learnerId || ''),
    queryFn: () => LearnerLeaveTypeService.getLearnerResidency(learnerId!),
    enabled: !!learnerId,
    staleTime: 5 * 60_000,
  });
}

export function useEligibleLeaveTypes(
  residency: Exclude<LearnerLeaveResidency, 'both'> | undefined,
  category: LeaveOndutyCategory
) {
  return useQuery({
    queryKey: LEARNER_LEAVE_TYPE_KEYS.eligible(residency || '', category),
    queryFn: () => LearnerLeaveTypeService.getEligibleTypes(residency!, category),
    enabled: !!residency,
    staleTime: 60_000,
  });
}

export function useSaveLearnerLeaveType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input, userId }: { id?: string; input: LearnerLeaveTypeInput; userId: string }) =>
      id
        ? LearnerLeaveTypeService.updateType(id, input, userId)
        : LearnerLeaveTypeService.createType(input, userId),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: LEARNER_LEAVE_TYPE_KEYS.all });
      toast.success(v.id ? 'Leave type updated' : 'Leave type created');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useToggleLearnerLeaveType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, is_active, userId }: { id: string; is_active: boolean; userId: string }) =>
      LearnerLeaveTypeService.updateType(id, { is_active }, userId),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: LEARNER_LEAVE_TYPE_KEYS.all });
      toast.success(v.is_active ? 'Leave type activated' : 'Leave type deactivated');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteLearnerLeaveType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => LearnerLeaveTypeService.deleteType(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LEARNER_LEAVE_TYPE_KEYS.all });
      toast.success('Leave type deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useLearnerLeaveFlows(leaveTypeId: string | null | undefined) {
  return useQuery({
    queryKey: LEARNER_LEAVE_TYPE_KEYS.flows(leaveTypeId || ''),
    queryFn: () => LearnerLeaveTypeService.listFlows(leaveTypeId!),
    enabled: !!leaveTypeId,
  });
}

export function useSaveLearnerLeaveFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      leaveTypeId,
      institutionId,
      steps,
    }: {
      leaveTypeId: string;
      institutionId: string | null;
      steps: Pick<LearnerLeaveFlowStep, 'role_id' | 'scope'>[];
    }) => LearnerLeaveTypeService.saveFlow(leaveTypeId, institutionId, steps),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: LEARNER_LEAVE_TYPE_KEYS.flows(v.leaveTypeId) });
      toast.success(v.steps.length ? 'Approval flow saved' : 'Approval flow removed');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useApprovalRoleOptions() {
  return useQuery({
    queryKey: LEARNER_LEAVE_TYPE_KEYS.roles,
    queryFn: () => LearnerLeaveTypeService.listApprovalRoles(),
    staleTime: 5 * 60_000,
  });
}
