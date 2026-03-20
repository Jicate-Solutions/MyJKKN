// hooks/admission/use-lead-scoring.ts
// React Query hooks for Lead Scoring Engine

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  LeadScoringEngineService,
  LeadScore,
  LeadScoreFilters,
  CalculateScoreResult,
  BulkScoreResult,
} from '@/lib/services/admission/lead-scoring-engine-service';

// Query keys for cache management
export const leadScoringKeys = {
  all: ['lead-scoring'] as const,
  score: (leadId: string) => [...leadScoringKeys.all, 'score', leadId] as const,
  breakdown: (leadId: string) => [...leadScoringKeys.all, 'breakdown', leadId] as const,
  byRange: (filters: LeadScoreFilters) => [...leadScoringKeys.all, 'range', filters] as const,
  withScores: (institutionId: string, options?: Record<string, unknown>) =>
    [...leadScoringKeys.all, 'with-scores', institutionId, options] as const,
  statistics: (institutionId: string) => [...leadScoringKeys.all, 'statistics', institutionId] as const,
};

// ============================================================================
// SCORE RETRIEVAL HOOKS
// ============================================================================

/**
 * Hook to get a single lead's score
 */
export function useLeadScore(leadId: string) {
  const query = useQuery({
    queryKey: leadScoringKeys.score(leadId),
    queryFn: () => LeadScoringEngineService.getLeadScore(leadId),
    enabled: !!leadId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    score: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to get detailed score breakdown for a lead
 */
export function useScoreBreakdown(leadId: string) {
  const query = useQuery({
    queryKey: leadScoringKeys.breakdown(leadId),
    queryFn: () => LeadScoringEngineService.getScoreBreakdown(leadId),
    enabled: !!leadId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    breakdown: query.data,
    score: query.data?.score,
    engagementDetails: query.data?.engagementDetails || {},
    qualityDetails: query.data?.qualityDetails || {},
    categoryInfo: query.data?.categoryInfo,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to get leads by score range
 */
export function useLeadsByScoreRange(filters: LeadScoreFilters) {
  const query = useQuery({
    queryKey: leadScoringKeys.byRange(filters),
    queryFn: () => LeadScoringEngineService.getLeadsByScoreRange(filters),
    enabled: !!filters.institution_id,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  return {
    scores: query.data?.data || [],
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to get leads with their scores
 */
export function useLeadsWithScores(
  institutionId: string,
  options?: {
    minScore?: number;
    maxScore?: number;
    category?: string;
    limit?: number;
  }
) {
  const query = useQuery({
    queryKey: leadScoringKeys.withScores(institutionId, options),
    queryFn: () => LeadScoringEngineService.getLeadsWithScores(institutionId, options),
    enabled: !!institutionId,
    staleTime: 2 * 60 * 1000,
  });

  return {
    leads: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to get score statistics for an institution
 */
export function useScoreStatistics(institutionId: string) {
  const query = useQuery({
    queryKey: leadScoringKeys.statistics(institutionId),
    queryFn: () => LeadScoringEngineService.getScoreStatistics(institutionId),
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    statistics: query.data,
    totalLeads: query.data?.totalLeads || 0,
    scoredLeads: query.data?.scoredLeads || 0,
    averageScore: query.data?.averageScore || 0,
    medianScore: query.data?.medianScore || 0,
    distribution: query.data?.distribution || [],
    topPerformers: query.data?.topPerformers || [],
    needsAttention: query.data?.needsAttention || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

// ============================================================================
// SCORE CALCULATION HOOKS
// ============================================================================

/**
 * Hook for score calculation mutations
 */
export function useScoreCalculation() {
  const queryClient = useQueryClient();

  const calculateScore = useMutation({
    mutationFn: (leadId: string) => LeadScoringEngineService.calculateLeadScore(leadId),
    onSuccess: (data: CalculateScoreResult) => {
      toast.success(`Score calculated: ${data.totalScore} (${data.category})`);
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: leadScoringKeys.score(data.leadId) });
      queryClient.invalidateQueries({ queryKey: leadScoringKeys.breakdown(data.leadId) });
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
      queryClient.invalidateQueries({ queryKey: ['admission-lead', data.leadId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to calculate score');
    },
  });

  const calculateBulkScores = useMutation({
    mutationFn: (leadIds: string[]) => LeadScoringEngineService.calculateBulkScores(leadIds),
    onSuccess: (data: BulkScoreResult) => {
      if (data.failed > 0) {
        toast.warning(`Calculated ${data.success} scores. ${data.failed} failed.`);
      } else {
        toast.success(`Successfully calculated ${data.success} scores`);
      }
      // Invalidate all lead-related queries
      queryClient.invalidateQueries({ queryKey: leadScoringKeys.all });
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to calculate bulk scores');
    },
  });

  const recalculateAllScores = useMutation({
    mutationFn: (institutionId: string) =>
      LeadScoringEngineService.recalculateAllScores(institutionId),
    onSuccess: (data: BulkScoreResult) => {
      if (data.failed > 0) {
        toast.warning(`Recalculated ${data.success} scores. ${data.failed} failed.`);
      } else {
        toast.success(`Successfully recalculated all ${data.success} lead scores`);
      }
      // Invalidate all queries
      queryClient.invalidateQueries({ queryKey: leadScoringKeys.all });
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to recalculate scores');
    },
  });

  return {
    calculateScore,
    calculateBulkScores,
    recalculateAllScores,
    isCalculating: calculateScore.isPending,
    isBulkCalculating: calculateBulkScores.isPending,
    isRecalculating: recalculateAllScores.isPending,
  };
}

// ============================================================================
// HELPER HOOKS
// ============================================================================

/**
 * Hook to get score category color
 */
export function useScoreCategoryDisplay() {
  const getCategoryColor = (category: string): string => {
    const colorMap: Record<string, string> = {
      'Hot Lead': 'bg-red-500 text-white',
      'Warm Lead': 'bg-orange-500 text-white',
      'Qualified Lead': 'bg-yellow-500 text-black',
      'Nurture Lead': 'bg-blue-500 text-white',
      'Cold Lead': 'bg-gray-400 text-white',
      Unknown: 'bg-gray-200 text-gray-700',
    };
    return colorMap[category] || colorMap.Unknown;
  };

  const getScoreColor = (score: number): string => {
    if (score >= 90) return 'text-red-600';
    if (score >= 70) return 'text-orange-600';
    if (score >= 50) return 'text-yellow-600';
    if (score >= 30) return 'text-blue-600';
    return 'text-gray-600';
  };

  const getCategoryBadge = (category: string): {
    label: string;
    color: string;
    icon: string;
  } => {
    const badges: Record<string, { label: string; color: string; icon: string }> = {
      'Hot Lead': { label: 'Hot', color: 'destructive', icon: 'flame' },
      'Warm Lead': { label: 'Warm', color: 'warning', icon: 'sun' },
      'Qualified Lead': { label: 'Qualified', color: 'default', icon: 'check' },
      'Nurture Lead': { label: 'Nurture', color: 'secondary', icon: 'leaf' },
      'Cold Lead': { label: 'Cold', color: 'outline', icon: 'snowflake' },
    };
    return badges[category] || { label: category, color: 'outline', icon: 'circle' };
  };

  return {
    getCategoryColor,
    getScoreColor,
    getCategoryBadge,
  };
}

/**
 * Hook to format score breakdown for display
 */
export function useScoreBreakdownFormatter() {
  const formatEngagementItem = (
    name: string,
    item: { occurrences: number; points: number; maxOccurrences: number; maxPoints: number }
  ) => ({
    name,
    occurrences: item.occurrences,
    points: item.points,
    maxOccurrences: item.maxOccurrences,
    maxPoints: item.maxPoints,
    percentage: item.maxPoints > 0 ? Math.round((item.points / item.maxPoints) * 100) : 0,
  });

  const formatQualityItem = (
    name: string,
    item: { value: number; weight: number; weighted_score: number }
  ) => ({
    name,
    value: item.value,
    weight: item.weight,
    weightedScore: item.weighted_score,
    maxWeightedScore: item.weight,
    percentage: item.weight > 0 ? Math.round((item.weighted_score / item.weight) * 100) : 0,
  });

  const formatBreakdown = (breakdown: {
    engagement: Record<string, { occurrences: number; points: number; maxOccurrences: number; maxPoints: number }>;
    quality: Record<string, { value: number; weight: number; weighted_score: number }>;
  }) => ({
    engagement: Object.entries(breakdown.engagement).map(([name, item]) =>
      formatEngagementItem(name, item)
    ),
    quality: Object.entries(breakdown.quality).map(([name, item]) =>
      formatQualityItem(name, item)
    ),
  });

  return {
    formatEngagementItem,
    formatQualityItem,
    formatBreakdown,
  };
}
