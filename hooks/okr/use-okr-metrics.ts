// ============================================================================
// useOKRMetrics - React Hook for OKR Metric Engine
// Provides easy access to auto-metrics for components
// ============================================================================

'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { OKRMetricEngine } from '@/lib/services/okr/okr-metric-engine';
import type {
  MetricRegistryEntry,
  MetricContext,
  MetricResult,
  MetricFilter,
  MetricScope,
  BulkMetricSyncResult,
  MetricPickerOption,
} from '@/types/okr';

// ============================================================================
// Query Keys
// ============================================================================

export const metricKeys = {
  all: ['okr-metrics'] as const,
  registry: () => [...metricKeys.all, 'registry'] as const,
  registryFiltered: (filter?: MetricFilter) => [...metricKeys.registry(), filter] as const,
  byModule: () => [...metricKeys.all, 'by-module'] as const,
  byKey: (key: string) => [...metricKeys.all, 'by-key', key] as const,
  forRole: (role: string, scope?: MetricScope) => [...metricKeys.all, 'for-role', role, scope] as const,
  value: (key: string, context: MetricContext) => [...metricKeys.all, 'value', key, context] as const,
  userMetrics: (profileId: string) => [...metricKeys.all, 'user', profileId] as const,
};

// ============================================================================
// useAvailableMetrics - Get all available metrics from registry
// ============================================================================

export function useAvailableMetrics(filter?: MetricFilter) {
  return useQuery({
    queryKey: metricKeys.registryFiltered(filter),
    queryFn: () => OKRMetricEngine.getAvailableMetrics(filter),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000,   // 30 minutes
  });
}

// ============================================================================
// useMetricsByModule - Get metrics grouped by module
// ============================================================================

export function useMetricsByModule() {
  return useQuery({
    queryKey: metricKeys.byModule(),
    queryFn: () => OKRMetricEngine.getMetricsByModule(),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

// ============================================================================
// useMetric - Get a single metric by key
// ============================================================================

export function useMetric(metricKey: string | undefined) {
  return useQuery({
    queryKey: metricKeys.byKey(metricKey || ''),
    queryFn: () => OKRMetricEngine.getMetricByKey(metricKey!),
    enabled: !!metricKey,
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// useMetricsForRole - Get metrics applicable to a specific role
// ============================================================================

export function useMetricsForRole(role: string, scope?: MetricScope) {
  return useQuery({
    queryKey: metricKeys.forRole(role, scope),
    queryFn: () => OKRMetricEngine.getMetricsForRole(role, scope),
    enabled: !!role,
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// useMetricValue - Execute a metric and get its value
// ============================================================================

export function useMetricValue(
  metricKey: string | undefined,
  context: MetricContext,
  options?: {
    enabled?: boolean;
    refetchInterval?: number;
  }
) {
  return useQuery({
    queryKey: metricKeys.value(metricKey || '', context),
    queryFn: () => OKRMetricEngine.executeMetric(metricKey!, context),
    enabled: !!metricKey && (options?.enabled ?? true),
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: options?.refetchInterval,
  });
}

// ============================================================================
// useExecuteMetric - Mutation for executing a metric
// ============================================================================

export function useExecuteMetric() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      metricKey,
      context,
    }: {
      metricKey: string;
      context: MetricContext;
    }): Promise<MetricResult> => {
      return OKRMetricEngine.executeMetric(metricKey, context);
    },
    onSuccess: (data, variables) => {
      // Update cache
      queryClient.setQueryData(
        metricKeys.value(variables.metricKey, variables.context),
        data
      );
    },
  });
}

// ============================================================================
// useSyncUserMetrics - Sync all metrics for a user
// ============================================================================

export function useSyncUserMetrics() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      profileId,
      institutionId,
      role,
    }: {
      profileId: string;
      institutionId: string;
      role: string;
    }): Promise<BulkMetricSyncResult> => {
      return OKRMetricEngine.syncAllMetricsForUser(profileId, institutionId, role);
    },
    onSuccess: (_, variables) => {
      // Invalidate user metrics queries
      queryClient.invalidateQueries({
        queryKey: metricKeys.userMetrics(variables.profileId),
      });
    },
  });
}

// ============================================================================
// useSyncUserOKRMetrics - Sync all auto-tracked KRs for a user
// ============================================================================

export function useSyncUserOKRMetrics() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profileId: string) => {
      return OKRMetricEngine.syncUserOKRMetrics(profileId);
    },
    onSuccess: () => {
      // Invalidate OKR queries to reflect updated values
      queryClient.invalidateQueries({ queryKey: ['okr'] });
    },
  });
}

// ============================================================================
// useInvalidateMetricCache - Invalidate cache for a metric
// ============================================================================

export function useInvalidateMetricCache() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      metricKey,
      context,
    }: {
      metricKey: string;
      context?: MetricContext;
    }): Promise<boolean> => {
      return OKRMetricEngine.invalidateCache(metricKey, context);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: metricKeys.byKey(variables.metricKey),
      });
    },
  });
}

// ============================================================================
// useCleanExpiredCache - Clean expired cache entries
// ============================================================================

export function useCleanExpiredCache() {
  return useMutation({
    mutationFn: () => OKRMetricEngine.cleanExpiredCache(),
  });
}

// ============================================================================
// useRegisterMetric - Register a new metric
// ============================================================================

export function useRegisterMetric() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (metric: Omit<MetricRegistryEntry, 'id' | 'created_at' | 'updated_at'>) => {
      // Cast to service type for compatibility
      return OKRMetricEngine.registerMetric(metric as Parameters<typeof OKRMetricEngine.registerMetric>[0]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: metricKeys.registry() });
    },
  });
}

// ============================================================================
// useUpdateMetric - Update an existing metric
// ============================================================================

export function useUpdateMetric() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      metricKey,
      updates,
    }: {
      metricKey: string;
      updates: Partial<MetricRegistryEntry>;
    }) => {
      // Cast to service type for compatibility
      return OKRMetricEngine.updateMetric(metricKey, updates as Parameters<typeof OKRMetricEngine.updateMetric>[1]);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: metricKeys.registry() });
      queryClient.invalidateQueries({ queryKey: metricKeys.byKey(variables.metricKey) });
    },
  });
}

// ============================================================================
// useDeactivateMetric - Deactivate a metric
// ============================================================================

export function useDeactivateMetric() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (metricKey: string) => {
      return OKRMetricEngine.deactivateMetric(metricKey);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: metricKeys.registry() });
    },
  });
}

// ============================================================================
// useMetricPicker - Hook for metric selection UI
// ============================================================================

export function useMetricPicker(options?: {
  role?: string;
  scope?: MetricScope;
  module?: string;
  category?: string;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModule, setSelectedModule] = useState<string | undefined>(options?.module);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(options?.category);

  const filter: MetricFilter = useMemo(() => ({
    roles: options?.role ? [options.role] : undefined,
    scopes: options?.scope ? [options.scope] : undefined,
    module: selectedModule,
    category: selectedCategory,
    search: searchQuery || undefined,
  }), [options?.role, options?.scope, selectedModule, selectedCategory, searchQuery]);

  const { data: metrics, isLoading, error } = useAvailableMetrics(filter);
  const { data: metricsByModule } = useMetricsByModule();

  // Get unique modules and categories
  const modules = useMemo(() => {
    if (!metricsByModule) return [];
    return Object.keys(metricsByModule).sort();
  }, [metricsByModule]);

  const categories = useMemo(() => {
    if (!metrics) return [];
    const cats = new Set(metrics.map(m => m.category));
    return Array.from(cats).sort();
  }, [metrics]);

  // Transform to picker options
  const pickerOptions: MetricPickerOption[] = useMemo(() => {
    if (!metrics) return [];
    return metrics.map(m => ({
      metric_key: m.metric_key,
      display_name: m.display_name,
      description: m.description,
      module: m.module,
      category: m.category,
      unit: m.unit,
      default_target: m.default_target,
      icon: m.icon,
      tags: m.tags,
    }));
  }, [metrics]);

  // Group by module
  const optionsByModule = useMemo(() => {
    return pickerOptions.reduce((acc, opt) => {
      if (!acc[opt.module]) {
        acc[opt.module] = [];
      }
      acc[opt.module].push(opt);
      return acc;
    }, {} as Record<string, MetricPickerOption[]>);
  }, [pickerOptions]);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedModule(undefined);
    setSelectedCategory(undefined);
  }, []);

  return {
    // State
    searchQuery,
    selectedModule,
    selectedCategory,

    // Setters
    setSearchQuery,
    setSelectedModule,
    setSelectedCategory,
    clearFilters,

    // Data
    options: pickerOptions,
    optionsByModule,
    modules,
    categories,

    // Status
    isLoading,
    error,
  };
}

// ============================================================================
// useAutoMetricSync - Manually trigger metric sync for a user
// ============================================================================

export function useAutoMetricSync(profileId: string | undefined) {
  const { mutate: syncMetrics, isPending } = useSyncUserOKRMetrics();

  // Trigger sync manually
  const startSync = useCallback(() => {
    if (profileId) {
      syncMetrics(profileId);
    }
  }, [profileId, syncMetrics]);

  return {
    sync: startSync,
    isSyncing: isPending,
  };
}

// ============================================================================
// useMetricDisplay - Format metric value for display
// ============================================================================

export function useMetricDisplay(metric: MetricRegistryEntry | undefined, value: number | null) {
  return useMemo(() => {
    if (!metric || value === null) {
      return {
        formattedValue: '-',
        color: 'gray',
        progress: 0,
      };
    }

    // Format value based on display_format
    let formattedValue = value.toFixed(metric.precision);
    if (metric.display_format) {
      formattedValue = metric.display_format.replace('{value}', formattedValue);
    } else if (metric.unit) {
      formattedValue = `${formattedValue}${metric.unit}`;
    }

    // Determine color based on value vs target
    let color = 'gray';
    let progress = 0;

    if (metric.default_target && metric.default_target !== 0) {
      progress = Math.min(Math.max((value / metric.default_target) * 100, 0), 100);

      // Color coding based on progress toward target
      const progressRatio = value / metric.default_target;
      if (progressRatio >= 0.9) {
        color = 'green';
      } else if (progressRatio >= 0.7) {
        color = 'yellow';
      } else if (progressRatio > 0) {
        color = 'red';
      }
    }

    return {
      formattedValue,
      color,
      progress,
    };
  }, [metric, value]);
}
