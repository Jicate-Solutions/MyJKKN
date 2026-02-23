'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { HousekeepingService } from '@/lib/services/campus-living/housekeeping-service'
import type {
  CreateCleaningScheduleDTO,
  CleaningScheduleFilters,
  CleaningTaskFilters,
  HostelCleaningSchedule,
} from '@/types/campus-living'

// Query key factory
export const housekeepingKeys = {
  all: ['housekeeping'] as const,
  schedules: () => [...housekeepingKeys.all, 'schedules'] as const,
  scheduleList: (filters: Record<string, unknown>) => [...housekeepingKeys.schedules(), filters] as const,
  scheduleDetail: (id: string) => [...housekeepingKeys.schedules(), 'detail', id] as const,
  tasks: () => [...housekeepingKeys.all, 'tasks'] as const,
  taskList: (filters: Record<string, unknown>) => [...housekeepingKeys.tasks(), filters] as const,
  tasksByDate: (institutionId: string, date: string) => [...housekeepingKeys.tasks(), 'date', institutionId, date] as const,
  todayStats: (institutionId: string) => [...housekeepingKeys.all, 'today-stats', institutionId] as const,
}

// --- Query hooks ---

export function useCleaningSchedules(institutionId: string, filters?: CleaningScheduleFilters) {
  return useQuery({
    queryKey: housekeepingKeys.scheduleList({ institutionId, ...filters }),
    queryFn: () => HousekeepingService.getSchedules(institutionId, filters),
    enabled: !!institutionId,
  })
}

export function useCleaningSchedule(id: string) {
  return useQuery({
    queryKey: housekeepingKeys.scheduleDetail(id),
    queryFn: () => HousekeepingService.getSchedule(id),
    enabled: !!id,
  })
}

export function useCleaningTasks(institutionId: string, filters?: CleaningTaskFilters) {
  return useQuery({
    queryKey: housekeepingKeys.taskList({ institutionId, ...filters }),
    queryFn: () => HousekeepingService.getTasks(institutionId, filters),
    enabled: !!institutionId,
  })
}

export function useCleaningTasksByDate(institutionId: string, date: string) {
  return useQuery({
    queryKey: housekeepingKeys.tasksByDate(institutionId, date),
    queryFn: () => HousekeepingService.getTasksByDate(institutionId, date),
    enabled: !!institutionId && !!date,
  })
}

export function useTodayCleaningStats(institutionId: string) {
  return useQuery({
    queryKey: housekeepingKeys.todayStats(institutionId),
    queryFn: () => HousekeepingService.getTodayStats(institutionId),
    enabled: !!institutionId,
  })
}

// --- Mutation hooks ---

export function useCreateCleaningSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateCleaningScheduleDTO) =>
      HousekeepingService.createSchedule(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: housekeepingKeys.schedules() })
      toast.success('Schedule created')
    },
    onError: (error: Error) => {
      toast.error(`Failed to create schedule: ${error.message}`)
    },
  })
}

export function useUpdateCleaningSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<HostelCleaningSchedule> }) =>
      HousekeepingService.updateSchedule(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: housekeepingKeys.schedules() })
      queryClient.invalidateQueries({ queryKey: housekeepingKeys.scheduleDetail(variables.id) })
      toast.success('Schedule updated')
    },
    onError: (error: Error) => {
      toast.error(`Failed to update schedule: ${error.message}`)
    },
  })
}

export function useDeleteCleaningSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => HousekeepingService.deleteSchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: housekeepingKeys.schedules() })
      toast.success('Schedule deleted')
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete schedule: ${error.message}`)
    },
  })
}

export function useCreateCleaningTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      institution_id: string
      schedule_id: string
      block_id?: string
      floor_number?: number
      date: string
      cleaning_type: string
      assigned_staff?: string
    }) => HousekeepingService.createTask(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: housekeepingKeys.tasks() })
      toast.success('Task created')
    },
    onError: (error: Error) => {
      toast.error(`Failed to create task: ${error.message}`)
    },
  })
}

export function useUpdateCleaningTaskStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      status,
      completedBy,
      qualityRating,
      inspectorNotes,
    }: {
      id: string
      status: string
      completedBy?: string
      qualityRating?: number
      inspectorNotes?: string
    }) => HousekeepingService.updateTaskStatus(id, status, completedBy, qualityRating, inspectorNotes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: housekeepingKeys.tasks() })
      queryClient.invalidateQueries({ queryKey: housekeepingKeys.all })
      toast.success('Task updated')
    },
    onError: (error: Error) => {
      toast.error(`Failed to update task: ${error.message}`)
    },
  })
}
