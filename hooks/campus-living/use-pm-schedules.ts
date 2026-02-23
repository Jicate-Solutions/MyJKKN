'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { PmScheduleService } from '@/lib/services/campus-living/pm-schedule-service'
import type {
  CreatePmScheduleDTO,
  PmScheduleFilters,
  PmTaskFilters,
  CompletePmTaskDTO,
  HostelPmSchedule,
} from '@/types/campus-living'

// Query key factory
export const pmScheduleKeys = {
  all: ['pm-schedules'] as const,
  schedules: (filters: Record<string, unknown>) => ['pm-schedules', 'list', filters] as const,
  schedule: (id: string) => ['pm-schedules', 'detail', id] as const,
  tasks: (filters: Record<string, unknown>) => ['pm-tasks', 'list', filters] as const,
  task: (id: string) => ['pm-tasks', 'detail', id] as const,
  overdue: (institutionId: string) => ['pm-tasks', 'overdue', institutionId] as const,
}

// --- Query hooks ---

export function usePmSchedules(institutionId: string, filters?: PmScheduleFilters) {
  return useQuery({
    queryKey: pmScheduleKeys.schedules({ institutionId, ...filters }),
    queryFn: () => PmScheduleService.getSchedules(institutionId, filters),
    enabled: !!institutionId,
  })
}

export function usePmSchedule(id: string) {
  return useQuery({
    queryKey: pmScheduleKeys.schedule(id),
    queryFn: () => PmScheduleService.getSchedule(id),
    enabled: !!id,
  })
}

export function usePmTasks(institutionId: string, filters?: PmTaskFilters) {
  return useQuery({
    queryKey: pmScheduleKeys.tasks({ institutionId, ...filters }),
    queryFn: () => PmScheduleService.getTasks(institutionId, filters),
    enabled: !!institutionId,
  })
}

export function usePmTask(id: string) {
  return useQuery({
    queryKey: pmScheduleKeys.task(id),
    queryFn: () => PmScheduleService.getTask(id),
    enabled: !!id,
  })
}

export function useOverduePmTasks(institutionId: string) {
  return useQuery({
    queryKey: pmScheduleKeys.overdue(institutionId),
    queryFn: () => PmScheduleService.getOverdueTasks(institutionId),
    enabled: !!institutionId,
  })
}

// --- Mutation hooks ---

export function useCreatePmSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreatePmScheduleDTO) =>
      PmScheduleService.createSchedule(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pmScheduleKeys.all })
      toast.success('PM schedule created')
    },
    onError: (error: Error) => {
      toast.error(`Failed to create PM schedule: ${error.message}`)
    },
  })
}

export function useUpdatePmSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<HostelPmSchedule> }) =>
      PmScheduleService.updateSchedule(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: pmScheduleKeys.all })
      queryClient.invalidateQueries({ queryKey: pmScheduleKeys.schedule(variables.id) })
      toast.success('PM schedule updated')
    },
    onError: (error: Error) => {
      toast.error(`Failed to update PM schedule: ${error.message}`)
    },
  })
}

export function useDeletePmSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => PmScheduleService.deleteSchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pmScheduleKeys.all })
      toast.success('PM schedule deleted')
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete PM schedule: ${error.message}`)
    },
  })
}

export function usePausePmSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => PmScheduleService.pauseSchedule(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: pmScheduleKeys.all })
      queryClient.invalidateQueries({ queryKey: pmScheduleKeys.schedule(id) })
      toast.success('PM schedule paused')
    },
    onError: (error: Error) => {
      toast.error(`Failed to pause PM schedule: ${error.message}`)
    },
  })
}

export function useResumePmSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => PmScheduleService.resumeSchedule(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: pmScheduleKeys.all })
      queryClient.invalidateQueries({ queryKey: pmScheduleKeys.schedule(id) })
      toast.success('PM schedule resumed')
    },
    onError: (error: Error) => {
      toast.error(`Failed to resume PM schedule: ${error.message}`)
    },
  })
}

export function useGeneratePmTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (scheduleId: string) => PmScheduleService.generateNextTask(scheduleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm-tasks'] })
      queryClient.invalidateQueries({ queryKey: pmScheduleKeys.all })
      toast.success('Task generated')
    },
    onError: (error: Error) => {
      toast.error(`Failed to generate task: ${error.message}`)
    },
  })
}

export function useCompletePmTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, completedBy, payload }: { id: string; completedBy: string; payload: CompletePmTaskDTO }) =>
      PmScheduleService.completeTask(id, completedBy, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['pm-schedules'] })
      toast.success('Task completed')
    },
    onError: (error: Error) => {
      toast.error(`Failed to complete task: ${error.message}`)
    },
  })
}
