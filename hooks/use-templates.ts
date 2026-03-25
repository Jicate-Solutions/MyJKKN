'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TemplateFilters,
  CreateTemplateDto,
  UpdateTemplateDto,
  CreateTimetableDto
} from '@/types/academics';
import toast from 'react-hot-toast';
import { TimetableService } from '@/lib/services/academic/timetable-service';

// Query key factory
const templateKeys = {
  all: ['templates'] as const,
  lists: () => [...templateKeys.all, 'list'] as const,
  list: (filters: TemplateFilters) =>
    [...templateKeys.lists(), filters] as const,
  details: () => [...templateKeys.all, 'detail'] as const,
  detail: (id: string) => [...templateKeys.details(), id] as const
};

// Get templates list
export function useTemplates(filters: TemplateFilters = {}) {
  return useQuery({
    queryKey: templateKeys.list(filters),
    queryFn: () => TimetableService.getTemplates(filters),
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
}

// Get single template
export function useTemplate(id: string) {
  return useQuery({
    queryKey: templateKeys.detail(id),
    queryFn: () => TimetableService.getTemplate(id),
    enabled: !!id
  });
}

// Create template mutation
export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTemplateDto) =>
      TimetableService.saveAsTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
      toast.success('Template created successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create template');
    }
  });
}

// Update template mutation
export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTemplateDto }) =>
      TimetableService.updateTemplate(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
      queryClient.invalidateQueries({ queryKey: templateKeys.detail(id) });
      toast.success('Template updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update template');
    }
  });
}

// Delete template mutation
export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => TimetableService.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
      toast.success('Template deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete template');
    }
  });
}

// Create timetable from template mutation
export function useCreateFromTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      templateId,
      timetableData
    }: {
      templateId: string;
      timetableData: CreateTimetableDto;
    }) =>
      TimetableService.createTimetableFromTemplate(templateId, timetableData),
    onSuccess: () => {
      // Invalidate both templates and timetables queries
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['timetables'] });
      toast.success('Timetable created from template successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create timetable from template');
    }
  });
}

// Duplicate template mutation
export function useDuplicateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      TimetableService.duplicateTemplate(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
      toast.success('Template duplicated successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to duplicate template');
    }
  });
}
