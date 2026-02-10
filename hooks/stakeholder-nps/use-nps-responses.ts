/**
 * React Query hooks for NPS Responses
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NPSService } from '@/lib/services/stakeholder-nps/nps-service';
import type {
  SubmitNPSResponseDto,
  NPSResponseFilters
} from '@/types/stakeholder-nps';

export function useNPSResponses(filters: NPSResponseFilters) {
  return useQuery({
    queryKey: ['nps-responses', filters],
    queryFn: () => NPSService.getResponses(filters),
    staleTime: 1000 * 60 * 5
  });
}

export function useSubmitNPSResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: SubmitNPSResponseDto) => NPSService.submitResponse(dto),
    onSuccess: (_, dto) => {
      queryClient.invalidateQueries({ queryKey: ['nps-responses'] });
      queryClient.invalidateQueries({ queryKey: ['nps-survey', dto.survey_id] });
      queryClient.invalidateQueries({ queryKey: ['nps-analytics', dto.survey_id] });
    }
  });
}

export function useSurveyResponseSummary(surveyId: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['nps-response-summary', surveyId],
    queryFn: () => NPSService.getSurveyAnalytics(surveyId),
    enabled: !!surveyId,
    staleTime: 1000 * 60 * 2
  });

  return {
    summary: data,
    loading: isLoading,
    error
  };
}

export function useExportResponses() {
  const exportResponses = async (surveyId: string, surveyTitle?: string) => {
    // Export functionality - generates CSV file of responses

    try {
      const responses = await NPSService.getResponses({
        survey_id: surveyId,
        limit: 1000 // Get all responses
      });

      if (!responses.data || responses.data.length === 0) {
        console.warn('[useExportResponses] No responses to export');
        return null;
      }

      // Convert to CSV format
      const headers = ['Date', 'Stakeholder Type', 'Score', 'Sentiment', 'Feedback'];
      const rows = responses.data.map(r => [
        new Date(r.created_at).toLocaleDateString(),
        r.stakeholder_type,
        r.score.toString(),
        r.sentiment,
        r.feedback ? `"${r.feedback.replace(/"/g, '""')}"` : ''
      ]);

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `nps-responses-${surveyTitle || surveyId}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      return responses.data;
    } catch (error) {
      console.error('[useExportResponses] Export failed:', error);
      throw error;
    }
  };

  return {
    exportResponses,
    loading: false
  };
}
