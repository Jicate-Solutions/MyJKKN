// ============================================
// USER STATS SERVER SERVICE - CACHE COMPONENTS ENABLED
// ============================================
// Created: 2025-01-26
// Purpose: Server-side user statistics with caching
// Cache Strategy:
//   - Stats cached per institution (cacheLife: hours)
//   - Invalidate on user create/delete/bulk operations
// ============================================

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { UserStats } from '@/types/users';
import { cacheLife, cacheTag } from 'next/cache';

/**
 * Fetch user statistics from the database (server-side only)
 *
 * @param institutionId - Optional institution ID to filter stats
 * @returns UserStats object with counts and breakdowns
 */
async function getUserStatsServer(institutionId?: string): Promise<UserStats> {
  try {
    const supabase = await createServerSupabaseClient();
    const fromProfiles = supabase.from('profiles');

    // Base queries
    let totalQuery = fromProfiles.select('*', {
      count: 'exact',
      head: true
    });
    let activeQuery = fromProfiles.select('*', {
      count: 'exact',
      head: true
    });
    let inactiveQuery = fromProfiles.select('*', {
      count: 'exact',
      head: true
    });
    let rolesQuery = fromProfiles.select('role');

    // Apply institution filter if provided
    if (institutionId) {
      totalQuery = totalQuery.eq('institution_id', institutionId);
      activeQuery = activeQuery.eq('institution_id', institutionId);
      inactiveQuery = inactiveQuery.eq('institution_id', institutionId);
      rolesQuery = rolesQuery.eq('institution_id', institutionId);
    }

    // Get total users
    const { count: total, error: totalError } = (await totalQuery) as {
      count: number | null;
      error: any;
    };
    if (totalError) throw totalError;

    // Get active users
    const { count: active, error: activeError } = (await activeQuery.eq(
      'is_active',
      true
    )) as { count: number | null; error: any };
    if (activeError) throw activeError;

    // Get inactive users
    const { count: inactive, error: inactiveError } = (await inactiveQuery.eq(
      'is_active',
      false
    )) as { count: number | null; error: any };
    if (inactiveError) throw inactiveError;

    // Get all profiles with role data for counting
    const { data: profiles, error: profilesError } = (await rolesQuery) as {
      data: { role: string | null }[] | null;
      error: any;
    };
    if (profilesError) throw profilesError;

    // Count roles manually
    const byRole: Record<string, number> = {};
    profiles?.forEach((profile) => {
      if (profile.role) {
        byRole[profile.role] = (byRole[profile.role] || 0) + 1;
      }
    });

    // Placeholder for institution breakdown (can be enhanced later)
    const byInstitution: Record<string, number> = {};

    return {
      total: total || 0,
      active: active || 0,
      inactive: inactive || 0,
      byRole,
      byInstitution
    };
  } catch (error) {
    console.error('[users/user-stats-server] Error fetching user stats:', error);
    throw error;
  }
}

/**
 * CACHED version of getUserStats for use in server components
 *
 * Cache Configuration:
 * - cacheLife: 'hours' - Refreshes every hour (stats change infrequently)
 * - cacheTag: 'user-stats' + institutionId - For targeted cache invalidation
 *
 * Invalidate this cache when:
 * - New users are created
 * - Users are deleted
 * - User roles are updated in bulk
 * - User status is toggled
 *
 * Usage in server components:
 * ```typescript
 * const stats = await getCachedUserStats(institutionId);
 * ```
 */
export async function getCachedUserStats(institutionId?: string): Promise<UserStats> {
  'use cache';

  // Cache for 1 hour - stats don't change frequently
  cacheLife('hours');

  // Tag for cache invalidation
  cacheTag('user-stats', institutionId || 'all-institutions');

  return await getUserStatsServer(institutionId);
}
