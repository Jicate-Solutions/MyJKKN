'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CampusLivingAccessLog } from '@/lib/services/campus-living/campus-living-access-log';
import type {
  HostelAccessLog,
} from '@/types/campus-living';

// Query key factory
export const hostelAccessLogKeys = {
  all: ['hostel-access-log'] as const,
  list: (filters: Record<string, unknown>) => ['hostel-access-log', 'list', filters] as const,
  detail: (id: string) => ['hostel-access-log', 'detail', id] as const,
};

// --- Query hooks ---

export function useHostelAccessLogs(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: hostelAccessLogKeys.list({ institutionId, ...filters }),
    queryFn: () => CampusLivingAccessLog.getAccessLogs(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useHostelAccessLog(id: string) {
  return useQuery({
    queryKey: hostelAccessLogKeys.detail(id),
    queryFn: () => CampusLivingAccessLog.getAccessLog(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useCreateHostelAccessLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<HostelAccessLog, 'id' | 'created_at'>) =>
      CampusLivingAccessLog.createAccessLog(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelAccessLogKeys.all });
      toast.success('Access log recorded');
    },
    onError: (error: Error) => {
      toast.error(`Failed to record access log: ${error.message}`);
    },
  });
}

export function useUpdateHostelAccessLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<HostelAccessLog> }) =>
      CampusLivingAccessLog.updateAccessLog(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelAccessLogKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelAccessLogKeys.detail(variables.id) });
      toast.success('Access log updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update access log: ${error.message}`);
    },
  });
}

export function useDeleteHostelAccessLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => CampusLivingAccessLog.deleteAccessLog(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelAccessLogKeys.all });
      toast.success('Access log deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete access log: ${error.message}`);
    },
  });
}
