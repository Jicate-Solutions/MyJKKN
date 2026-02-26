// hooks/admission/use-agentic-query.ts
// React Query hooks for Agentic Query Processing

import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface QueryIntent {
  type: 'count' | 'list' | 'aggregate' | 'compare' | 'trend' | 'filter';
  entities: string[];
  filters: QueryFilter[];
  timeRange?: TimeRange;
  groupBy?: string[];
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
  confidence: number;
}

export interface QueryFilter {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'between';
  value: string | number | string[] | [number, number];
}

export interface TimeRange {
  start?: string;
  end?: string;
  period?: string;
}

export interface QueryStep {
  id: string;
  name: 'understanding' | 'planning' | 'executing' | 'analyzing' | 'responding';
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  message?: string;
  details?: string;
}

export interface AgenticQueryResult {
  success: boolean;
  query: string;
  intent?: QueryIntent;
  data: any;
  summary: string;
  visualizationType?: 'table' | 'chart' | 'cards' | 'metric';
  error?: string;
  executionTimeMs: number;
}

export interface QueryHistoryEntry {
  id: string;
  query: string;
  result: AgenticQueryResult;
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY KEYS
// ═══════════════════════════════════════════════════════════════════════════

export const agenticQueryKeys = {
  all: ['agentic-query'] as const,
  suggestions: () => [...agenticQueryKeys.all, 'suggestions'] as const,
  history: (institutionId: string) => [...agenticQueryKeys.all, 'history', institutionId] as const,
};

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hook for executing agentic queries with streaming support
 */
export function useAgenticQuery(institutionId: string) {
  const queryClient = useQueryClient();
  const [steps, setSteps] = useState<QueryStep[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentResult, setCurrentResult] = useState<AgenticQueryResult | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const executeStreamingQuery = useCallback(async (query: string): Promise<AgenticQueryResult> => {
    // Reset state
    setSteps([]);
    setCurrentResult(null);
    setIsStreaming(true);

    // Create abort controller
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/ai/agentic-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, institutionId, stream: true }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Query failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult: AgenticQueryResult | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === 'step') {
                setSteps(prev => {
                  const existingIndex = prev.findIndex(s => s.id === parsed.step.id);
                  if (existingIndex >= 0) {
                    const updated = [...prev];
                    updated[existingIndex] = parsed.step;
                    return updated;
                  }
                  return [...prev, parsed.step];
                });
              } else if (parsed.type === 'result') {
                finalResult = parsed.result;
                setCurrentResult(parsed.result);
              } else if (parsed.type === 'error') {
                throw new Error(parsed.error?.error || 'Query failed');
              }
            } catch (parseError) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }

      if (!finalResult) {
        throw new Error('No result received');
      }

      // Add to history cache
      queryClient.setQueryData(
        agenticQueryKeys.history(institutionId),
        (old: QueryHistoryEntry[] = []) => [
          { id: Date.now().toString(), query, result: finalResult, createdAt: new Date().toISOString() },
          ...old.slice(0, 19), // Keep last 20
        ]
      );

      return finalResult;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return {
          success: false,
          query,
          data: null,
          summary: 'Query cancelled',
          error: 'Query was cancelled',
          executionTimeMs: 0,
        };
      }
      throw error;
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [institutionId, queryClient]);

  const mutation = useMutation({
    mutationFn: executeStreamingQuery,
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to process query');
    },
  });

  const cancelQuery = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return {
    executeQuery: mutation.mutate,
    executeQueryAsync: mutation.mutateAsync,
    isLoading: mutation.isPending || isStreaming,
    isStreaming,
    steps,
    result: currentResult,
    error: mutation.error,
    cancelQuery,
    reset: () => {
      setSteps([]);
      setCurrentResult(null);
      mutation.reset();
    },
  };
}

/**
 * Hook for non-streaming query execution
 */
export function useAgenticQuerySync(institutionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (query: string): Promise<AgenticQueryResult> => {
      const response = await fetch('/api/ai/agentic-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, institutionId, stream: false }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Query failed');
      }

      const result = await response.json();

      // Add to history
      queryClient.setQueryData(
        agenticQueryKeys.history(institutionId),
        (old: QueryHistoryEntry[] = []) => [
          { id: Date.now().toString(), query, result, createdAt: new Date().toISOString() },
          ...old.slice(0, 19),
        ]
      );

      return result;
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to process query');
    },
  });
}

/**
 * Hook for getting suggested queries
 */
export function useSuggestedQueries() {
  return useQuery({
    queryKey: agenticQueryKeys.suggestions(),
    queryFn: async (): Promise<string[]> => {
      const response = await fetch('/api/ai/agentic-query');
      if (!response.ok) {
        throw new Error('Failed to fetch suggestions');
      }
      const data = await response.json();
      return data.suggestions || [];
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

/**
 * Hook for query history (in-memory)
 */
export function useQueryHistory(institutionId: string) {
  const queryClient = useQueryClient();

  const history = queryClient.getQueryData<QueryHistoryEntry[]>(
    agenticQueryKeys.history(institutionId)
  ) || [];

  const clearHistory = useCallback(() => {
    queryClient.setQueryData(agenticQueryKeys.history(institutionId), []);
  }, [queryClient, institutionId]);

  const removeFromHistory = useCallback((id: string) => {
    queryClient.setQueryData(
      agenticQueryKeys.history(institutionId),
      (old: QueryHistoryEntry[] = []) => old.filter(entry => entry.id !== id)
    );
  }, [queryClient, institutionId]);

  return {
    history,
    clearHistory,
    removeFromHistory,
  };
}

/**
 * Hook for common query patterns/templates
 */
export function useQueryTemplates() {
  return {
    templates: [
      {
        id: 'leads-by-source',
        name: 'Leads by Source',
        query: 'How many leads came from each source this month?',
        description: 'See which channels are generating the most leads',
      },
      {
        id: 'top-counselors',
        name: 'Top Counselors',
        query: 'Who are the top 5 counselors by conversion rate?',
        description: 'Identify your best performing counselors',
      },
      {
        id: 'hot-leads',
        name: 'Hot Leads',
        query: 'List all hot leads that need follow-up today',
        description: 'Prioritize leads that need immediate attention',
      },
      {
        id: 'conversion-rate',
        name: 'Conversion Rate',
        query: 'What is our overall conversion rate this quarter?',
        description: 'Track your funnel performance',
      },
      {
        id: 'lead-trends',
        name: 'Lead Trends',
        query: 'Show the trend of new leads over the past 30 days',
        description: 'Visualize lead generation over time',
      },
      {
        id: 'program-interest',
        name: 'Program Interest',
        query: 'Which programs have the most interested leads?',
        description: 'Understand program demand',
      },
      {
        id: 'stale-leads',
        name: 'Stale Leads',
        query: 'Show leads that have not been contacted in the last 7 days',
        description: 'Find leads that need attention',
      },
      {
        id: 'source-roi',
        name: 'Source ROI',
        query: 'Compare lead sources by conversion rate and cost',
        description: 'Analyze which sources provide best ROI',
      },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hook to format query results for display
 */
export function useQueryResultFormatter() {
  return {
    formatMetric: (value: number): string => {
      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
      return value.toString();
    },

    formatPercentage: (value: number): string => {
      return `${(value * 100).toFixed(1)}%`;
    },

    formatDuration: (ms: number): string => {
      if (ms < 1000) return `${ms}ms`;
      return `${(ms / 1000).toFixed(2)}s`;
    },

    getVisualizationIcon: (type: string): string => {
      switch (type) {
        case 'metric': return 'hash';
        case 'chart': return 'bar-chart';
        case 'cards': return 'layout-grid';
        case 'table': return 'table';
        default: return 'file-text';
      }
    },
  };
}
