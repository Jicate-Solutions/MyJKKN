'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  GateSecurityService,
  type ReportFilters,
} from '@/lib/services/gate-security/gate-security-service';

export const gateSecurityKeys = {
  all: ['gate-security'] as const,
  today: () => [...gateSecurityKeys.all, 'today'] as const,
  search: (q: string) => [...gateSecurityKeys.all, 'search', q] as const,
  report: (f: ReportFilters) => [...gateSecurityKeys.all, 'report', f] as const,
  mine: () => [...gateSecurityKeys.all, 'mine'] as const,
};

export function useGateTodayActivity(enabled = true) {
  return useQuery({
    queryKey: gateSecurityKeys.today(),
    queryFn: () => GateSecurityService.todayActivity(),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useGateSearch(query: string, enabled = true) {
  const q = query.trim();
  return useQuery({
    queryKey: gateSecurityKeys.search(q),
    queryFn: () => GateSecurityService.search(q),
    enabled: enabled && q.length >= 2,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export function useRecordGateMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input:
      | { kind: 'learner'; passId: string; direction: 'in' | 'out'; gateLocation?: string }
      | { kind: 'staff'; staffId: string; direction: 'in' | 'out'; reason?: string | null; gateLocation?: string; staffPassId?: string | null }) =>
      input.kind === 'learner'
        ? GateSecurityService.recordLearnerMovement(input.passId, input.direction, input.gateLocation)
        : GateSecurityService.recordStaffMovement(input.staffId, input.direction, input.reason, input.gateLocation, input.staffPassId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: gateSecurityKeys.today() });
      void qc.invalidateQueries({ queryKey: ['gate-passes'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Could not record the movement'),
  });
}

export function useUpdateGateReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ movementId, reason }: { movementId: string; reason: string }) =>
      GateSecurityService.updateReason(movementId, reason),
    onSuccess: () => {
      toast.success('Reason updated');
      void qc.invalidateQueries({ queryKey: gateSecurityKeys.all });
    },
    onError: (err: Error) => toast.error(err.message || 'Could not update the reason'),
  });
}

export function useGateReport(filters: ReportFilters, enabled = true) {
  return useQuery({
    queryKey: gateSecurityKeys.report(filters),
    queryFn: () => GateSecurityService.report(filters),
    enabled,
    placeholderData: (prev) => prev,
  });
}

export function useMyStaffPasses(enabled = true) {
  return useQuery({
    queryKey: [...gateSecurityKeys.all, 'my-staff-passes'] as const,
    queryFn: () => GateSecurityService.myStaffPasses(),
    enabled,
    refetchInterval: 30_000,
  });
}

export function useCreateStaffPass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => GateSecurityService.createStaffPass(reason),
    onSuccess: () => {
      toast.success('Gate pass ready. Show the QR at the gate.');
      void qc.invalidateQueries({ queryKey: gateSecurityKeys.all });
    },
    onError: (err: Error) => toast.error(err.message || 'Could not create the gate pass'),
  });
}

export function useMyGateMovements(enabled = true) {
  return useQuery({
    queryKey: gateSecurityKeys.mine(),
    queryFn: () => GateSecurityService.myMovements(),
    enabled,
  });
}
