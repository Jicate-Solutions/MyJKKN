import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useApplications } from './use-applications';
import { usePermissions } from './use-permissions';
import { Application } from '@/types/applications';
import { ApplicationFilters } from '@/lib/services/application/application-service';

export interface LearnerAppFilters
  extends Omit<ApplicationFilters, 'isActive'> {
  sortBy?: 'name' | 'popular' | 'recent' | 'category';
  categoryId?: string;
}

export interface UseLearnerAppsReturn {
  // Data
  applications: Application[];
  featuredApps: Application[];
  recentApps: Application[];
  categorizedApps: Record<string, Application[]>;

  // State
  loading: boolean;
  error: string | null;
  filters: LearnerAppFilters;

  // Actions
  updateFilters: (newFilters: Partial<LearnerAppFilters>) => void;
  refreshApps: () => Promise<void>;
  trackAppUsage: (appId: string) => void;

  // Computed
  totalAppsCount: number;
  hasAccess: boolean;
}

export function useLearnerApps(
  initialFilters: LearnerAppFilters = {}
): UseLearnerAppsReturn {
  const { userProfile: profile, isLoading: authLoading } = usePermissions();
  const [filters, setFilters] = useState<LearnerAppFilters>({
    sortBy: 'popular',
    limit: 50,
    ...initialFilters
  });

  // Base applications hook - always fetch active applications
  const {
    applications: allApplications,
    loading: appsLoading,
    error,
    fetchApplications,
    updateFilters: updateBaseFilters
  } = useApplications({
    isActive: true, // Only active apps for learners
    limit: filters.limit || 50
  });

  // Use ref to track if initial fetch has been done and prevent re-fetches
  const hasInitialFetchRef = useRef(false);

  // Trigger initial fetch when component mounts (only once)
  useEffect(() => {
    if (!hasInitialFetchRef.current && !authLoading) {
      fetchApplications();
      hasInitialFetchRef.current = true;
    }
  }, [fetchApplications, authLoading]); // Only depend on authLoading, not on fetchApplications

  // Filter applications based on learner's role and access
  const accessibleApplications = useMemo(() => {
    if (!allApplications.length || authLoading || !profile) {
      return [];
    }

    return allApplications.filter((app) => {
      // Check if app has valid roles_access array
      if (!app.roles_access || !Array.isArray(app.roles_access)) {
        return false;
      }

      // Check if user's role has access to this app
      const userRole = profile.role;
      const hasRoleAccess =
        app.roles_access.includes(userRole) ||
        app.roles_access.includes('student') ||
        app.roles_access.includes('all');

      return hasRoleAccess;
    });
  }, [allApplications, profile, authLoading]);

  // Apply additional learner-specific filters
  const filteredApplications = useMemo(() => {
    let filtered = [...accessibleApplications];

    // Apply category filter
    if (filters.categoryId && filters.categoryId !== 'all') {
      filtered = filtered.filter(
        (app) => app.category_id === filters.categoryId
      );
    }

    // Apply search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
        (app) =>
          app.name.toLowerCase().includes(searchLower) ||
          app.description?.toLowerCase().includes(searchLower) ||
          app.category?.name.toLowerCase().includes(searchLower) ||
          app.tags?.some((tag) => tag.toLowerCase().includes(searchLower))
      );
    }

    // Apply sorting
    switch (filters.sortBy) {
      case 'name':
        return filtered.sort((a, b) => a.name.localeCompare(b.name));

      case 'recent':
        return filtered.sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );

      case 'category':
        return filtered.sort((a, b) => {
          const categoryCompare = (a.category?.name || '').localeCompare(
            b.category?.name || ''
          );
          return categoryCompare !== 0
            ? categoryCompare
            : a.name.localeCompare(b.name);
        });

      case 'popular':
      default:
        // Sort by display_order first, then by name
        return filtered.sort((a, b) => {
          if (a.display_order !== b.display_order) {
            return a.display_order - b.display_order;
          }
          return a.name.localeCompare(b.name);
        });
    }
  }, [accessibleApplications, filters]);

  // Featured apps (top apps with good display order and recent updates)
  const featuredApps = useMemo(() => {
    return filteredApplications
      .filter((app) => app.display_order <= 10) // Top 10 display order
      .slice(0, 6);
  }, [filteredApplications]);

  // Recent apps (apps updated in the last 30 days)
  const recentApps = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return filteredApplications
      .filter((app) => new Date(app.updated_at) >= thirtyDaysAgo)
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )
      .slice(0, 8);
  }, [filteredApplications]);

  // Categorized apps
  const categorizedApps = useMemo(() => {
    const grouped: Record<string, Application[]> = {};

    filteredApplications.forEach((app) => {
      const categoryName = app.category?.name || 'Other';
      if (!grouped[categoryName]) {
        grouped[categoryName] = [];
      }
      grouped[categoryName].push(app);
    });

    // Sort apps within each category
    Object.keys(grouped).forEach((category) => {
      grouped[category].sort((a, b) => a.name.localeCompare(b.name));
    });

    return grouped;
  }, [filteredApplications]);

  // Update filters with learner-specific handling
  const updateFilters = useCallback(
    (newFilters: Partial<LearnerAppFilters>) => {
      setFilters((prev) => ({
        ...prev,
        ...newFilters
      }));

      // Note: We don't call updateBaseFilters here to prevent automatic fetches
      // All filtering is done client-side in the useMemo hooks above
      // Only fetch when explicitly refreshing via refreshApps()
    },
    []
  );

  // Refresh apps
  const refreshApps = useCallback(async () => {
    await fetchApplications();
  }, [fetchApplications]);

  // Track app usage (can be extended for analytics)
  const trackAppUsage = useCallback((appId: string) => {
    // Store usage data in localStorage for now
    const usageKey = 'learner_app_usage';
    const usage = JSON.parse(localStorage.getItem(usageKey) || '{}');

    if (!usage[appId]) {
      usage[appId] = { count: 0, lastUsed: null };
    }

    usage[appId].count++;
    usage[appId].lastUsed = new Date().toISOString();

    localStorage.setItem(usageKey, JSON.stringify(usage));

    // Here you could also send to analytics service
  }, []);

  // Check if user has access to apps
  const hasAccess = useMemo(() => {
    return !authLoading && !!profile && accessibleApplications.length > 0;
  }, [authLoading, profile, accessibleApplications.length]);

  // Combined loading state
  const loading = authLoading || appsLoading;

  return {
    // Data
    applications: filteredApplications,
    featuredApps,
    recentApps,
    categorizedApps,

    // State
    loading,
    error,
    filters,

    // Actions
    updateFilters,
    refreshApps,
    trackAppUsage,

    // Computed
    totalAppsCount: filteredApplications.length,
    hasAccess
  };
}

// Hook for getting app usage statistics
export function useAppUsageStats() {
  const [usage, setUsage] = useState<
    Record<string, { count: number; lastUsed: string }>
  >({});

  useEffect(() => {
    const usageKey = 'learner_app_usage';
    const storedUsage = localStorage.getItem(usageKey);
    if (storedUsage) {
      try {
        setUsage(JSON.parse(storedUsage));
      } catch (error) {
        // Failed to parse stored usage data, continue with empty state
      }
    }
  }, []);

  const getMostUsedApps = useCallback(
    (limit: number = 5) => {
      return Object.entries(usage)
        .sort(([, a], [, b]) => b.count - a.count)
        .slice(0, limit)
        .map(([appId, stats]) => ({ appId, ...stats }));
    },
    [usage]
  );

  const getAppUsageCount = useCallback(
    (appId: string) => {
      return usage[appId]?.count || 0;
    },
    [usage]
  );

  const getLastUsed = useCallback(
    (appId: string) => {
      const lastUsed = usage[appId]?.lastUsed;
      return lastUsed ? new Date(lastUsed) : null;
    },
    [usage]
  );

  return {
    usage,
    getMostUsedApps,
    getAppUsageCount,
    getLastUsed
  };
}
