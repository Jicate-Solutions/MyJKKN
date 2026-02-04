// hooks/admission/use-ai-insights.ts
// React Query hooks for AI Insights Dashboard

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AIInsightsService,
  type AIInsight,
  type InsightFilters,
  type InsightType,
  type InsightPriority,
  type TrendData,
  type Recommendation,
  type Anomaly,
} from '@/lib/services/admission/ai-insights-service';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const aiInsightsKeys = {
  all: ['ai-insights'] as const,
  lists: () => [...aiInsightsKeys.all, 'list'] as const,
  list: (filters: Partial<InsightFilters>) =>
    [...aiInsightsKeys.lists(), filters] as const,
  recommendations: (institutionId: string) =>
    [...aiInsightsKeys.all, 'recommendations', institutionId] as const,
  trends: (institutionId: string) =>
    [...aiInsightsKeys.all, 'trends', institutionId] as const,
  anomalies: (institutionId: string) =>
    [...aiInsightsKeys.all, 'anomalies', institutionId] as const,
};

// ============================================================================
// INSIGHTS HOOKS
// ============================================================================

/**
 * Get all insights for an institution
 */
export function useInsights(filters: InsightFilters) {
  const query = useQuery({
    queryKey: aiInsightsKeys.list(filters),
    queryFn: async () => {
      return AIInsightsService.getInsights(filters);
    },
    enabled: !!filters.institution_id,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  return {
    insights: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Get active (non-dismissed, non-expired) insights
 */
export function useActiveInsights(institutionId: string) {
  return useInsights({
    institution_id: institutionId,
    is_dismissed: false,
    include_expired: false,
  });
}

/**
 * Get insights by type
 */
export function useInsightsByType(
  institutionId: string,
  type: InsightType | InsightType[]
) {
  return useInsights({
    institution_id: institutionId,
    type,
    is_dismissed: false,
  });
}

/**
 * Get high priority insights (critical and high)
 */
export function useHighPriorityInsights(institutionId: string) {
  return useInsights({
    institution_id: institutionId,
    priority: ['critical', 'high'],
    is_dismissed: false,
    limit: 10,
  });
}

/**
 * Get recommendations
 */
export function useRecommendations(institutionId: string) {
  const query = useQuery({
    queryKey: aiInsightsKeys.recommendations(institutionId),
    queryFn: async () => {
      return AIInsightsService.getRecommendations(institutionId);
    },
    enabled: !!institutionId,
  });

  return {
    recommendations: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Get trends
 */
export function useTrends(institutionId: string) {
  const query = useQuery({
    queryKey: aiInsightsKeys.trends(institutionId),
    queryFn: async () => {
      return AIInsightsService.getTrends(institutionId);
    },
    enabled: !!institutionId,
  });

  return {
    trends: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Get anomalies
 */
export function useAnomalies(institutionId: string) {
  const query = useQuery({
    queryKey: aiInsightsKeys.anomalies(institutionId),
    queryFn: async () => {
      return AIInsightsService.getAnomalies(institutionId);
    },
    enabled: !!institutionId,
  });

  return {
    anomalies: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Dismiss insight mutation
 */
export function useDismissInsight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (insightId: string) => {
      return AIInsightsService.dismissInsight(insightId);
    },
    onSuccess: () => {
      toast.success('Insight dismissed');
      queryClient.invalidateQueries({ queryKey: aiInsightsKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to dismiss insight');
    },
  });
}

/**
 * Generate insights mutation
 */
export function useGenerateInsights() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (institutionId: string) => {
      return AIInsightsService.generateInsights(institutionId);
    },
    onSuccess: (data) => {
      toast.success(`Generated ${data.length} insights`);
      queryClient.invalidateQueries({ queryKey: aiInsightsKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate insights');
    },
  });
}

// ============================================================================
// COMBINED DASHBOARD HOOK
// ============================================================================

/**
 * Combined hook for AI Insights Dashboard
 */
export function useAIInsightsDashboard(institutionId: string) {
  const { insights, isLoading: insightsLoading, refetch: refetchInsights } =
    useActiveInsights(institutionId);

  const { recommendations, isLoading: recommendationsLoading } =
    useRecommendations(institutionId);

  const { trends, isLoading: trendsLoading } = useTrends(institutionId);

  const { anomalies, isLoading: anomaliesLoading } = useAnomalies(institutionId);

  const dismissInsight = useDismissInsight();
  const generateInsights = useGenerateInsights();

  // Group insights by type
  const insightsByType = insights.reduce<Record<InsightType, AIInsight[]>>(
    (acc, insight) => {
      if (!acc[insight.type]) {
        acc[insight.type] = [];
      }
      acc[insight.type].push(insight);
      return acc;
    },
    {} as Record<InsightType, AIInsight[]>
  );

  // Count by priority
  const countByPriority = insights.reduce<Record<InsightPriority, number>>(
    (acc, insight) => {
      acc[insight.priority] = (acc[insight.priority] || 0) + 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0 }
  );

  const isLoading =
    insightsLoading ||
    recommendationsLoading ||
    trendsLoading ||
    anomaliesLoading;

  return {
    // Data
    insights,
    insightsByType,
    countByPriority,
    recommendations,
    trends,
    anomalies,

    // Loading states
    isLoading,
    insightsLoading,
    recommendationsLoading,
    trendsLoading,
    anomaliesLoading,

    // Actions
    dismissInsight: dismissInsight.mutate,
    isDismissing: dismissInsight.isPending,
    generateInsights: () => generateInsights.mutate(institutionId),
    isGenerating: generateInsights.isPending,
    refetch: refetchInsights,
  };
}

// ============================================================================
// HELPER HOOKS
// ============================================================================

/**
 * Get insight priority badge color
 */
export function useInsightPriorityStyles() {
  return {
    getPriorityColor: (priority: InsightPriority): string => {
      const colors: Record<InsightPriority, string> = {
        critical: 'bg-red-100 text-red-800 border-red-200',
        high: 'bg-orange-100 text-orange-800 border-orange-200',
        medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        low: 'bg-blue-100 text-blue-800 border-blue-200',
      };
      return colors[priority];
    },
    getPriorityIcon: (priority: InsightPriority): string => {
      const icons: Record<InsightPriority, string> = {
        critical: 'AlertCircle',
        high: 'AlertTriangle',
        medium: 'Info',
        low: 'Lightbulb',
      };
      return icons[priority];
    },
  };
}

/**
 * Get insight type icon and label
 */
export function useInsightTypeStyles() {
  return {
    getTypeLabel: (type: InsightType): string => {
      const labels: Record<InsightType, string> = {
        follow_up_reminder: 'Follow-up Reminder',
        conversion_opportunity: 'Conversion Opportunity',
        engagement_alert: 'Engagement Alert',
        trend_insight: 'Trend Insight',
        anomaly_detection: 'Anomaly Detected',
        recommendation: 'Recommendation',
        performance_insight: 'Performance Insight',
      };
      return labels[type];
    },
    getTypeIcon: (type: InsightType): string => {
      const icons: Record<InsightType, string> = {
        follow_up_reminder: 'Bell',
        conversion_opportunity: 'TrendingUp',
        engagement_alert: 'AlertTriangle',
        trend_insight: 'LineChart',
        anomaly_detection: 'Activity',
        recommendation: 'Lightbulb',
        performance_insight: 'BarChart3',
      };
      return icons[type];
    },
  };
}
