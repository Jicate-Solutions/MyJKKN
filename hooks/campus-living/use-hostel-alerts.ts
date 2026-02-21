'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HostelAlertService } from '@/lib/services/campus-living/hostel-alert-service';
import type {
  HostelAlertRule,
  HostelRiskAlert,
} from '@/types/campus-living';

// Query key factory
export const hostelAlertKeys = {
  all: ['hostel-alerts'] as const,
  rules: (filters: Record<string, unknown>) => ['hostel-alerts', 'rules', filters] as const,
  riskAlerts: (filters: Record<string, unknown>) => ['hostel-alerts', 'risk-alerts', filters] as const,
  ruleDetail: (id: string) => ['hostel-alerts', 'rule', id] as const,
  riskAlertDetail: (id: string) => ['hostel-alerts', 'risk-alert', id] as const,
};

// --- Alert Rule query hooks ---

export function useHostelAlertRules(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: hostelAlertKeys.rules({ institutionId, ...filters }),
    queryFn: () => HostelAlertService.getAlertRules(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useHostelAlertRule(id: string) {
  return useQuery({
    queryKey: hostelAlertKeys.ruleDetail(id),
    queryFn: () => HostelAlertService.getAlertRule(id),
    enabled: !!id,
  });
}

// --- Risk Alert query hooks ---

export function useHostelRiskAlerts(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: hostelAlertKeys.riskAlerts({ institutionId, ...filters }),
    queryFn: () => HostelAlertService.getRiskAlerts(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useHostelRiskAlert(id: string) {
  return useQuery({
    queryKey: hostelAlertKeys.riskAlertDetail(id),
    queryFn: () => HostelAlertService.getRiskAlert(id),
    enabled: !!id,
  });
}

// --- Alert Rule mutation hooks ---

export function useCreateHostelAlertRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<HostelAlertRule, 'id' | 'created_at' | 'updated_at'>) =>
      HostelAlertService.createAlertRule(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelAlertKeys.all });
      toast.success('Alert rule created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create alert rule: ${error.message}`);
    },
  });
}

export function useUpdateHostelAlertRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<HostelAlertRule> }) =>
      HostelAlertService.updateAlertRule(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelAlertKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelAlertKeys.ruleDetail(variables.id) });
      toast.success('Alert rule updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update alert rule: ${error.message}`);
    },
  });
}

export function useDeleteHostelAlertRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => HostelAlertService.deleteAlertRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelAlertKeys.all });
      toast.success('Alert rule deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete alert rule: ${error.message}`);
    },
  });
}

// --- Risk Alert mutation hooks ---

export function useAcknowledgeRiskAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { acknowledged_by: string } }) =>
      HostelAlertService.acknowledgeRiskAlert(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelAlertKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelAlertKeys.riskAlertDetail(variables.id) });
      toast.success('Alert acknowledged');
    },
    onError: (error: Error) => {
      toast.error(`Failed to acknowledge alert: ${error.message}`);
    },
  });
}

export function useResolveRiskAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { resolved_by: string; resolution_notes: string } }) =>
      HostelAlertService.resolveRiskAlert(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelAlertKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelAlertKeys.riskAlertDetail(variables.id) });
      toast.success('Alert resolved');
    },
    onError: (error: Error) => {
      toast.error(`Failed to resolve alert: ${error.message}`);
    },
  });
}

export function useDeleteRiskAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => HostelAlertService.deleteRiskAlert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelAlertKeys.all });
      toast.success('Alert deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete alert: ${error.message}`);
    },
  });
}
