import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface CallIntelligence {
  id: string;
  call_log_id: string;
  analyze_status: 'pending' | 'submitted' | 'processing' | 'completed' | 'failed';
  transcription: string | null;
  transcription_language: string | null;
  sentiment: 'positive' | 'negative' | 'neutral' | null;
  sentiment_score: number | null;
  summary: string | null;
  categories: string[] | null;
  extracted_name: string | null;
  extracted_location: string | null;
  extracted_course: string | null;
  enrichment_applied: boolean;
  analyze_submitted_at: string | null;
  analyze_completed_at: string | null;
}

export const callIntelligenceKeys = {
  all: ['call-intelligence'] as const,
  detail: (callLogId: string) => ['call-intelligence', callLogId] as const,
};

export function useCallIntelligence(callLogId: string | undefined) {
  const query = useQuery({
    queryKey: callIntelligenceKeys.detail(callLogId ?? ''),
    queryFn: async () => {
      const res = await fetch(`/api/admission/calls/${callLogId}/intelligence`);
      if (!res.ok) throw new Error('Failed to fetch intelligence');
      const data = await res.json();
      return data.intelligence as CallIntelligence | null;
    },
    enabled: !!callLogId,
    // Auto-poll while processing
    refetchInterval: (query) => {
      const status = query.state.data?.analyze_status;
      if (status === 'submitted' || status === 'processing') return 5000; // 5s
      return false;
    },
  });

  return query;
}

export function useAnalyzeCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (callLogId: string) => {
      const res = await fetch(`/api/admission/calls/${callLogId}/analyze`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to trigger analysis');
      return res.json();
    },
    onSuccess: (_, callLogId) => {
      queryClient.invalidateQueries({ queryKey: callIntelligenceKeys.detail(callLogId) });
    },
  });
}
