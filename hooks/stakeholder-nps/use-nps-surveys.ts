/**
 * React Query hooks for NPS Surveys
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NPSService } from '@/lib/services/stakeholder-nps/nps-service';
import type {
  CreateNPSSurveyDto,
  UpdateNPSSurveyDto,
  NPSSurveyFilters
} from '@/types/stakeholder-nps';

export function useNPSSurveys(filters: NPSSurveyFilters) {
  return useQuery({
    queryKey: ['nps-surveys', filters],
    queryFn: () => NPSService.getSurveys(filters),
    staleTime: 1000 * 60 * 5
  });
}

export function useNPSSurvey(id: string | null) {
  return useQuery({
    queryKey: ['nps-survey', id],
    queryFn: () => id ? NPSService.getSurveyById(id) : null,
    enabled: !!id,
    staleTime: 1000 * 60 * 5
  });
}

export function useCreateNPSSurvey() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (dto: CreateNPSSurveyDto) => NPSService.createSurvey(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nps-surveys'] });
    }
  });
}

export function useUpdateNPSSurvey() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateNPSSurveyDto }) =>
      NPSService.updateSurvey(id, dto),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['nps-surveys'] });
      queryClient.invalidateQueries({ queryKey: ['nps-survey', id] });
    }
  });
}

export function useDeleteNPSSurvey() {
  const queryClient = useQueryClient();

  const deleteSurvey = async (id: string) => {
    const result = await NPSService.deleteSurvey(id);
    queryClient.invalidateQueries({ queryKey: ['nps-surveys'] });
    return result;
  };

  return {
    deleteSurvey,
    loading: false
  };
}

export function useActivateSurvey() {
  const queryClient = useQueryClient();

  const activateSurvey = async (id: string) => {
    const result = await NPSService.updateSurvey(id, { status: 'active' });
    queryClient.invalidateQueries({ queryKey: ['nps-surveys'] });
    queryClient.invalidateQueries({ queryKey: ['nps-survey', id] });
    return result;
  };

  return {
    activateSurvey,
    loading: false
  };
}

export function useCloseSurvey() {
  const queryClient = useQueryClient();

  const closeSurvey = async (id: string) => {
    const result = await NPSService.updateSurvey(id, { status: 'closed' });
    queryClient.invalidateQueries({ queryKey: ['nps-surveys'] });
    queryClient.invalidateQueries({ queryKey: ['nps-survey', id] });
    return result;
  };

  return {
    closeSurvey,
    loading: false
  };
}

export function useArchiveSurvey() {
  const queryClient = useQueryClient();

  const archiveSurvey = async (id: string) => {
    const result = await NPSService.updateSurvey(id, { status: 'archived' });
    queryClient.invalidateQueries({ queryKey: ['nps-surveys'] });
    queryClient.invalidateQueries({ queryKey: ['nps-survey', id] });
    return result;
  };

  return {
    archiveSurvey,
    loading: false
  };
}
