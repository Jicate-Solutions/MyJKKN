/**
 * Shared React Query Configuration
 * Purpose: Standardize caching behavior across the application
 * Created: 2025-12-10
 *
 * Usage:
 * import { QUERY_CONFIG } from '@/lib/config/query-config';
 *
 * useQuery({
 *   queryKey: ['data'],
 *   queryFn: fetchData,
 *   ...QUERY_CONFIG.STABLE_DATA
 * });
 */

/**
 * STABLE_DATA - For reference data that rarely changes
 * Use for: institutions, degrees, departments, programs, semesters, sections
 * Behavior: Cache for 5 minutes, keep in memory for 10 minutes
 */
const STABLE_DATA = {
  staleTime: 5 * 60 * 1000, // 5 minutes - data is considered fresh
  gcTime: 10 * 60 * 1000, // 10 minutes - keep in memory after becoming inactive
  refetchOnWindowFocus: false, // Don't refetch when window regains focus
  refetchOnMount: false, // Don't refetch if data exists and is fresh
  retry: 1 // Only retry once on failure
} as const;

/**
 * SEMI_STABLE_DATA - For data that changes occasionally
 * Use for: courses, course mappings, staff lists, academic years
 * Behavior: Cache for 2 minutes, keep in memory for 5 minutes
 */
const SEMI_STABLE_DATA = {
  staleTime: 2 * 60 * 1000, // 2 minutes
  gcTime: 5 * 60 * 1000, // 5 minutes
  refetchOnWindowFocus: false,
  refetchOnMount: 'always' as const, // Refetch on mount but use stale data while loading
  retry: 1
} as const;

/**
 * DYNAMIC_DATA - For frequently changing data
 * Use for: student lists, billing data, attendance records
 * Behavior: Cache for 30 seconds, keep in memory for 5 minutes
 */
const DYNAMIC_DATA = {
  staleTime: 30 * 1000, // 30 seconds
  gcTime: 5 * 60 * 1000, // 5 minutes
  refetchOnWindowFocus: false, // Still don't refetch on focus to prevent flickering
  refetchOnMount: true,
  retry: 1
} as const;

/**
 * REALTIME_DATA - For data that needs frequent updates
 * Use for: dashboards, live attendance, notifications
 * Behavior: Always fresh, auto-refetch every 30 seconds
 */
const REALTIME_DATA = {
  staleTime: 0, // Always considered stale
  gcTime: 5 * 60 * 1000, // 5 minutes - still cache for background updates
  refetchInterval: 30 * 1000, // 30 seconds auto-refresh
  refetchOnWindowFocus: true, // Refetch when user returns
  retry: 2
} as const;

/**
 * DASHBOARD_DATA - For dashboard statistics
 * Use for: attendance stats, analytics, summaries
 * Behavior: Stale after 2 minutes, auto-refetch every 5 minutes
 */
const DASHBOARD_DATA = {
  staleTime: 2 * 60 * 1000, // 2 minutes
  gcTime: 10 * 60 * 1000, // 10 minutes
  refetchInterval: 5 * 60 * 1000, // 5 minutes auto-refresh
  refetchOnWindowFocus: true,
  retry: 2
} as const;

/**
 * USER_SESSION_DATA - For user-specific data
 * Use for: user profile, permissions, preferences
 * Behavior: Cache for 10 minutes, no auto-refetch
 */
const USER_SESSION_DATA = {
  staleTime: 10 * 60 * 1000, // 10 minutes
  gcTime: 30 * 60 * 1000, // 30 minutes
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  retry: 1
} as const;

/**
 * SEARCH_DATA - For search results
 * Use for: student search, staff search, filtered lists
 * Behavior: Short cache to account for filter changes
 */
const SEARCH_DATA = {
  staleTime: 15 * 1000, // 15 seconds
  gcTime: 2 * 60 * 1000, // 2 minutes
  refetchOnWindowFocus: false,
  keepPreviousData: true,
  retry: 1
} as const;

/**
 * FORM_DATA - For form dropdown/select options
 * Use for: dropdown options that come from API
 * Behavior: Cache longer since options rarely change
 */
const FORM_DATA = {
  staleTime: 10 * 60 * 1000, // 10 minutes
  gcTime: 30 * 60 * 1000, // 30 minutes
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  retry: 1
} as const;

/**
 * Combined export for easy import
 */
export const QUERY_CONFIG = {
  STABLE_DATA,
  SEMI_STABLE_DATA,
  DYNAMIC_DATA,
  REALTIME_DATA,
  DASHBOARD_DATA,
  USER_SESSION_DATA,
  SEARCH_DATA,
  FORM_DATA
} as const;

/**
 * Type for query config keys
 */
export type QueryConfigType = keyof typeof QUERY_CONFIG;

/**
 * Default configuration for new queries
 * Use this as a base and override as needed
 */
export const DEFAULT_QUERY_CONFIG = DYNAMIC_DATA;

/**
 * Helper to get config by data type
 */
export function getQueryConfig(type: QueryConfigType) {
  return QUERY_CONFIG[type];
}
