'use client';

// hooks/health/use-wellness-surveys.ts
// React Query hooks for Health & Wellness → program-scoped scenario surveys.
// Created: 2026-09-28

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { WellnessSurveysService } from '@/lib/services/health/wellness-surveys-service';
import type { HealthSurvey } from '@/types/health-surveys';

const KEYS = {
  available: ['wellness-surveys', 'available'] as const,
  mine: (surveyId: string, userId: string) =>
    ['wellness-surveys', 'mine', surveyId, userId] as const,
  program: (programId: string) => ['wellness-surveys', 'program', programId] as const,
  survey: (surveyId: string) => ['wellness-surveys', 'survey', surveyId] as const,
  responses: (surveyId: string) => ['wellness-surveys', 'responses', surveyId] as const,
};

// --- Respondent ---------------------------------------------------------------

export function useProgramsWithActiveSurveys() {
  return useQuery({
    queryKey: KEYS.available,
    queryFn: () => WellnessSurveysService.getProgramsWithActiveSurveys(),
  });
}

export function useMySurveyType(userId: string | undefined) {
  return useQuery({
    queryKey: ['wellness-surveys', 'my-type', userId || ''],
    queryFn: () => WellnessSurveysService.getMyRespondentType(),
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });
}

export function useMySurveyResponse(surveyId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: KEYS.mine(surveyId || '', userId || ''),
    queryFn: () => WellnessSurveysService.getMyResponse(surveyId!, userId!),
    enabled: !!surveyId && !!userId,
  });
}

export function useSubmitSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: Parameters<typeof WellnessSurveysService.submit>[0]) =>
      WellnessSurveysService.submit(args),
    onSuccess: (row) => {
      qc.setQueryData(KEYS.mine(row.survey_id, row.user_id || ''), row);
      toast.success('Survey submitted — thank you!');
    },
    onError: (err: Error) => toast.error(err.message || 'Could not submit the survey'),
  });
}

// --- Admin --------------------------------------------------------------------

export function useProgramSurveys(programId: string | undefined) {
  return useQuery({
    queryKey: KEYS.program(programId || ''),
    queryFn: () => WellnessSurveysService.listProgramSurveys(programId!),
    enabled: !!programId,
  });
}

export function useSurvey(surveyId: string | undefined) {
  return useQuery({
    queryKey: KEYS.survey(surveyId || ''),
    queryFn: () => WellnessSurveysService.getSurvey(surveyId!),
    enabled: !!surveyId,
  });
}

export function useSurveyResponses(surveyId: string | undefined) {
  return useQuery({
    queryKey: KEYS.responses(surveyId || ''),
    queryFn: () => WellnessSurveysService.listResponses(surveyId!),
    enabled: !!surveyId,
  });
}

export function useCreateSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<HealthSurvey> & { program_id: string; title: string }) =>
      WellnessSurveysService.createSurvey(input),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: KEYS.program(row.program_id) });
      qc.invalidateQueries({ queryKey: KEYS.available });
      toast.success('Survey created');
    },
    onError: () => toast.error('Could not create survey'),
  });
}

export function useUpdateSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<HealthSurvey> }) =>
      WellnessSurveysService.updateSurvey(id, patch),
    onSuccess: (row) => {
      qc.setQueryData(KEYS.survey(row.id), row);
      qc.invalidateQueries({ queryKey: KEYS.program(row.program_id) });
      qc.invalidateQueries({ queryKey: KEYS.available });
      toast.success('Survey saved');
    },
    onError: () => toast.error('Could not save survey'),
  });
}

export function useDeleteSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; programId: string }) =>
      WellnessSurveysService.deleteSurvey(id),
    onSuccess: (_, { programId }) => {
      qc.invalidateQueries({ queryKey: KEYS.program(programId) });
      qc.invalidateQueries({ queryKey: KEYS.available });
      toast.success('Survey deleted');
    },
    onError: () => toast.error('Could not delete survey'),
  });
}
