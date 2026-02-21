'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CampusLivingSettings } from '@/lib/services/campus-living/campus-living-settings';
import type {
  HostelFeeConfig,
  HostelLeaveTypeConfig,
  HostelMaintenanceSlaConfig,
  HostelCurfewException,
} from '@/types/campus-living';

// Query key factory
export const campusLivingSettingsKeys = {
  all: ['campus-living-settings'] as const,
  feeConfig: (institutionId: string) => ['campus-living-settings', 'fee-config', institutionId] as const,
  leaveConfig: (institutionId: string) => ['campus-living-settings', 'leave-config', institutionId] as const,
  slaConfig: (institutionId: string) => ['campus-living-settings', 'sla-config', institutionId] as const,
  curfewExceptions: (institutionId: string) => ['campus-living-settings', 'curfew-exceptions', institutionId] as const,
  feeConfigDetail: (id: string) => ['campus-living-settings', 'fee-config', 'detail', id] as const,
  leaveConfigDetail: (id: string) => ['campus-living-settings', 'leave-config', 'detail', id] as const,
  slaConfigDetail: (id: string) => ['campus-living-settings', 'sla-config', 'detail', id] as const,
  curfewExceptionDetail: (id: string) => ['campus-living-settings', 'curfew-exception', 'detail', id] as const,
};

// --- Fee Config hooks ---

export function useHostelFeeConfigs(institutionId: string, academicYearId?: string) {
  return useQuery({
    queryKey: campusLivingSettingsKeys.feeConfig(institutionId),
    queryFn: () => CampusLivingSettings.getFeeConfigs(institutionId, academicYearId),
    enabled: !!institutionId,
  });
}

export function useHostelFeeConfig(id: string) {
  return useQuery({
    queryKey: campusLivingSettingsKeys.feeConfigDetail(id),
    queryFn: () => CampusLivingSettings.getFeeConfig(id),
    enabled: !!id,
  });
}

export function useCreateHostelFeeConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<HostelFeeConfig, 'id' | 'created_at'>) =>
      CampusLivingSettings.createFeeConfig(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: campusLivingSettingsKeys.all });
      toast.success('Fee configuration created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create fee config: ${error.message}`);
    },
  });
}

export function useUpdateHostelFeeConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<HostelFeeConfig> }) =>
      CampusLivingSettings.updateFeeConfig(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: campusLivingSettingsKeys.all });
      queryClient.invalidateQueries({ queryKey: campusLivingSettingsKeys.feeConfigDetail(variables.id) });
      toast.success('Fee configuration updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update fee config: ${error.message}`);
    },
  });
}

export function useDeleteHostelFeeConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => CampusLivingSettings.deleteFeeConfig(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: campusLivingSettingsKeys.all });
      toast.success('Fee configuration deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete fee config: ${error.message}`);
    },
  });
}

// --- Leave Config hooks ---

export function useHostelLeaveConfigs(institutionId: string) {
  return useQuery({
    queryKey: campusLivingSettingsKeys.leaveConfig(institutionId),
    queryFn: () => CampusLivingSettings.getLeaveTypeConfigs(institutionId),
    enabled: !!institutionId,
  });
}

export function useHostelLeaveConfig(id: string) {
  return useQuery({
    queryKey: campusLivingSettingsKeys.leaveConfigDetail(id),
    queryFn: () => CampusLivingSettings.getLeaveTypeConfig(id),
    enabled: !!id,
  });
}

export function useCreateHostelLeaveConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<HostelLeaveTypeConfig, 'id' | 'created_at' | 'updated_at'>) =>
      CampusLivingSettings.createLeaveTypeConfig(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: campusLivingSettingsKeys.all });
      toast.success('Leave configuration created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create leave config: ${error.message}`);
    },
  });
}

export function useUpdateHostelLeaveConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<HostelLeaveTypeConfig> }) =>
      CampusLivingSettings.updateLeaveTypeConfig(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: campusLivingSettingsKeys.all });
      queryClient.invalidateQueries({ queryKey: campusLivingSettingsKeys.leaveConfigDetail(variables.id) });
      toast.success('Leave configuration updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update leave config: ${error.message}`);
    },
  });
}

export function useDeleteHostelLeaveConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => CampusLivingSettings.deleteLeaveTypeConfig(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: campusLivingSettingsKeys.all });
      toast.success('Leave configuration deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete leave config: ${error.message}`);
    },
  });
}

// --- SLA Config hooks ---

export function useHostelSlaConfigs(institutionId: string) {
  return useQuery({
    queryKey: campusLivingSettingsKeys.slaConfig(institutionId),
    queryFn: () => CampusLivingSettings.getSlaConfigs(institutionId),
    enabled: !!institutionId,
  });
}

export function useHostelSlaConfig(id: string) {
  return useQuery({
    queryKey: campusLivingSettingsKeys.slaConfigDetail(id),
    queryFn: () => CampusLivingSettings.getSlaConfig(id),
    enabled: !!id,
  });
}

export function useCreateHostelSlaConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<HostelMaintenanceSlaConfig, 'id' | 'created_at' | 'updated_at'>) =>
      CampusLivingSettings.createSlaConfig(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: campusLivingSettingsKeys.all });
      toast.success('SLA configuration created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create SLA config: ${error.message}`);
    },
  });
}

export function useUpdateHostelSlaConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<HostelMaintenanceSlaConfig> }) =>
      CampusLivingSettings.updateSlaConfig(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: campusLivingSettingsKeys.all });
      queryClient.invalidateQueries({ queryKey: campusLivingSettingsKeys.slaConfigDetail(variables.id) });
      toast.success('SLA configuration updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update SLA config: ${error.message}`);
    },
  });
}

export function useDeleteHostelSlaConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => CampusLivingSettings.deleteSlaConfig(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: campusLivingSettingsKeys.all });
      toast.success('SLA configuration deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete SLA config: ${error.message}`);
    },
  });
}

// --- Curfew Exception hooks ---

export function useHostelCurfewExceptions(institutionId: string, activeOnly?: boolean) {
  return useQuery({
    queryKey: campusLivingSettingsKeys.curfewExceptions(institutionId),
    queryFn: () => CampusLivingSettings.getCurfewExceptions(institutionId, activeOnly),
    enabled: !!institutionId,
  });
}

export function useHostelCurfewException(id: string) {
  return useQuery({
    queryKey: campusLivingSettingsKeys.curfewExceptionDetail(id),
    queryFn: () => CampusLivingSettings.getCurfewException(id),
    enabled: !!id,
  });
}

export function useCreateHostelCurfewException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<HostelCurfewException, 'id' | 'created_at' | 'updated_at'>) =>
      CampusLivingSettings.createCurfewException(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: campusLivingSettingsKeys.all });
      toast.success('Curfew exception created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create curfew exception: ${error.message}`);
    },
  });
}

export function useUpdateHostelCurfewException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<HostelCurfewException> }) =>
      CampusLivingSettings.updateCurfewException(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: campusLivingSettingsKeys.all });
      queryClient.invalidateQueries({ queryKey: campusLivingSettingsKeys.curfewExceptionDetail(variables.id) });
      toast.success('Curfew exception updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update curfew exception: ${error.message}`);
    },
  });
}

export function useDeleteHostelCurfewException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => CampusLivingSettings.deleteCurfewException(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: campusLivingSettingsKeys.all });
      toast.success('Curfew exception deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete curfew exception: ${error.message}`);
    },
  });
}
