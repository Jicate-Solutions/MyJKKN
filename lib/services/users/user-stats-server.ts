// ============================================
// USER STATS SERVER SERVICE - CACHE COMPONENTS ENABLED
// ============================================
// Created: 2025-01-26
// Purpose: Server-side user statistics with caching
// Cache Strategy:
//   - Stats cached per institution (cacheLife: hours)
//   - Invalidate on user create/delete/bulk operations
// ============================================

import { createClient } from '@supabase/supabase-js';
import type { UserStats } from '@/types/users';
import { withRetry } from '@/lib/retry';
// cacheLife/cacheTag disabled — requires cacheComponents in next.config.ts
// import { cacheLife, cacheTag } from 'next/cache';

async function getUserStatsServer(institutionId?: string): Promise<UserStats> {
  try {
    // Retries transient TLS/socket resets (ECONNRESET) from Node's keep-alive
    // pool against Supabase REST. Each attempt re-awaits the query builders,
    // which issues a fresh fetch on a new socket.
    return await withRetry(async () => {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const fromProfiles = supabase.from('profiles');

      let totalQuery = fromProfiles.select('*', { count: 'exact', head: true });
      let activeQuery = fromProfiles.select('*', { count: 'exact', head: true });
      let inactiveQuery = fromProfiles.select('*', { count: 'exact', head: true });
      let rolesQuery = fromProfiles.select('role');

      if (institutionId) {
        totalQuery = totalQuery.eq('institution_id', institutionId);
        activeQuery = activeQuery.eq('institution_id', institutionId);
        inactiveQuery = inactiveQuery.eq('institution_id', institutionId);
        rolesQuery = rolesQuery.eq('institution_id', institutionId);
      }

      const { count: total, error: totalError } = (await totalQuery) as {
        count: number | null;
        error: any;
      };
      if (totalError) throw totalError;

      const { count: active, error: activeError } = (await activeQuery.eq(
        'is_active',
        true
      )) as { count: number | null; error: any };
      if (activeError) throw activeError;

      const { count: inactive, error: inactiveError } = (await inactiveQuery.eq(
        'is_active',
        false
      )) as { count: number | null; error: any };
      if (inactiveError) throw inactiveError;

      const { data: profiles, error: profilesError } = (await rolesQuery) as {
        data: { role: string | null }[] | null;
        error: any;
      };
      if (profilesError) throw profilesError;

      const byRole: Record<string, number> = {};
      profiles?.forEach((profile) => {
        if (profile.role) {
          byRole[profile.role] = (byRole[profile.role] || 0) + 1;
        }
      });

      const byInstitution: Record<string, number> = {};

      return {
        total: total || 0,
        active: active || 0,
        inactive: inactive || 0,
        byRole,
        byInstitution
      };
    });
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
  // NOTE: 'use cache' + cacheLife/cacheTag disabled until cacheComponents is re-enabled
  return await getUserStatsServer(institutionId);
}
