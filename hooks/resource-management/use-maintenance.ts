// hooks/resource-management/use-maintenance.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { maintenanceService } from '@/lib/services/resource-management/maintenance-service';
import { useToast } from '@/hooks/use-toast';
import type {
  MaintenanceLogFilters,
  MaintenanceScheduleFilters,
  CreateMaintenanceLogDto,
  UpdateMaintenanceLogDto,
  CreateMaintenanceScheduleDto,
  UpdateMaintenanceScheduleDto
} from '@/types/maintenance';

// ==================== QUERY KEYS ====================

export const maintenanceKeys = {
  all: ['maintenance'] as const,
  logs: () => [...maintenanceKeys.all, 'logs'] as const,
  log: (id: string) => [...maintenanceKeys.logs(), id] as const,
  schedules: () => [...maintenanceKeys.all, 'schedules'] as const,
  schedule: (id: string) => [...maintenanceKeys.schedules(), id] as const,
  stats: (resourceId?: string) =>
    [...maintenanceKeys.all, 'stats', resourceId] as const,
  upcoming: () => [...maintenanceKeys.all, 'upcoming'] as const,
  overdue: () => [...maintenanceKeys.all, 'overdue'] as const
};

// ==================== MAINTENANCE LOGS ====================

export function useMaintenanceLogs(filters?: MaintenanceLogFilters) {
  return useQuery({
    queryKey: [...maintenanceKeys.logs(), filters],
    queryFn: () => maintenanceService.getMaintenanceLogs(filters),
    staleTime: 30000 // 30 seconds
  });
}

export function useMaintenanceLog(id: string) {
  return useQuery({
    queryKey: maintenanceKeys.log(id),
    queryFn: () => maintenanceService.getMaintenanceLogById(id),
    enabled: !!id
  });
}

export function useUpcomingMaintenance() {
  return useQuery({
    queryKey: maintenanceKeys.upcoming(),
    queryFn: () => maintenanceService.getUpcomingMaintenance(),
    staleTime: 60000 // 1 minute
  });
}

export function useOverdueMaintenance() {
  return useQuery({
    queryKey: maintenanceKeys.overdue(),
    queryFn: () => maintenanceService.getOverdueMaintenance(),
    staleTime: 60000 // 1 minute
  });
}

// ==================== MAINTENANCE SCHEDULES ====================

export function useMaintenanceSchedules(filters?: MaintenanceScheduleFilters) {
  return useQuery({
    queryKey: [...maintenanceKeys.schedules(), filters],
    queryFn: () => maintenanceService.getMaintenanceSchedules(filters),
    staleTime: 30000 // 30 seconds
  });
}

export function useMaintenanceSchedule(id: string) {
  return useQuery({
    queryKey: maintenanceKeys.schedule(id),
    queryFn: () => maintenanceService.getMaintenanceScheduleById(id),
    enabled: !!id
  });
}

// ==================== STATISTICS ====================

export function useMaintenanceStats(resourceId?: string) {
  return useQuery({
    queryKey: maintenanceKeys.stats(resourceId),
    queryFn: () => maintenanceService.getMaintenanceStats(resourceId),
    staleTime: 60000 // 1 minute
  });
}

// ==================== MUTATIONS ====================

export function useMaintenanceOperations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createLog = useMutation({
    mutationFn: ({
      dto,
      userId
    }: {
      dto: CreateMaintenanceLogDto;
      userId: string;
    }) => maintenanceService.createMaintenanceLog(dto, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.logs() });
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.stats() });
      toast({
        title: 'Success',
        description: 'Maintenance log created successfully'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create maintenance log',
        variant: 'destructive'
      });
    }
  });

  const updateLog = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateMaintenanceLogDto }) =>
      maintenanceService.updateMaintenanceLog(id, dto),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.logs() });
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.log(data.id) });
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.stats() });
      toast({
        title: 'Success',
        description: 'Maintenance log updated successfully'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update maintenance log',
        variant: 'destructive'
      });
    }
  });

  const completeLog = useMutation({
    mutationFn: ({
      id,
      data
    }: {
      id: string;
      data: { completed_date: string; notes?: string; cost?: number };
    }) => maintenanceService.completeMaintenanceLog(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.logs() });
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.log(data.id) });
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.stats() });
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.upcoming() });
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.overdue() });
      toast({
        title: 'Success',
        description: 'Maintenance completed successfully'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to complete maintenance',
        variant: 'destructive'
      });
    }
  });

  const cancelLog = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      maintenanceService.cancelMaintenanceLog(id, reason),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.logs() });
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.log(data.id) });
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.stats() });
      toast({
        title: 'Success',
        description: 'Maintenance cancelled successfully'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel maintenance',
        variant: 'destructive'
      });
    }
  });

  const deleteLog = useMutation({
    mutationFn: (id: string) => maintenanceService.deleteMaintenanceLog(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.logs() });
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.stats() });
      toast({
        title: 'Success',
        description: 'Maintenance log deleted successfully'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete maintenance log',
        variant: 'destructive'
      });
    }
  });

  const createSchedule = useMutation({
    mutationFn: (dto: CreateMaintenanceScheduleDto) =>
      maintenanceService.createMaintenanceSchedule(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.schedules() });
      toast({
        title: 'Success',
        description: 'Maintenance schedule created successfully'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create maintenance schedule',
        variant: 'destructive'
      });
    }
  });

  const updateSchedule = useMutation({
    mutationFn: ({
      id,
      dto
    }: {
      id: string;
      dto: UpdateMaintenanceScheduleDto;
    }) => maintenanceService.updateMaintenanceSchedule(id, dto),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.schedules() });
      queryClient.invalidateQueries({
        queryKey: maintenanceKeys.schedule(data.id)
      });
      toast({
        title: 'Success',
        description: 'Maintenance schedule updated successfully'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update maintenance schedule',
        variant: 'destructive'
      });
    }
  });

  const deleteSchedule = useMutation({
    mutationFn: (id: string) =>
      maintenanceService.deleteMaintenanceSchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.schedules() });
      toast({
        title: 'Success',
        description: 'Maintenance schedule deleted successfully'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete maintenance schedule',
        variant: 'destructive'
      });
    }
  });

  return {
    createLog,
    updateLog,
    completeLog,
    cancelLog,
    deleteLog,
    createSchedule,
    updateSchedule,
    deleteSchedule
  };
}

// Individual mutation exports for easier usage
export function useCreateMaintenanceLog() {
  return useMaintenanceOperations().createLog;
}

export function useUpdateMaintenanceLog() {
  return useMaintenanceOperations().updateLog;
}

export function useCompleteMaintenanceLog() {
  return useMaintenanceOperations().completeLog;
}

export function useCancelMaintenanceLog() {
  return useMaintenanceOperations().cancelLog;
}

export function useDeleteMaintenanceLog() {
  return useMaintenanceOperations().deleteLog;
}

export function useCreateMaintenanceSchedule() {
  return useMaintenanceOperations().createSchedule;
}

export function useUpdateMaintenanceSchedule() {
  return useMaintenanceOperations().updateSchedule;
}

export function useDeleteMaintenanceSchedule() {
  return useMaintenanceOperations().deleteSchedule;
}
