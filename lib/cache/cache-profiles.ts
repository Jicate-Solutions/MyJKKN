/**
 * Cache Life Profiles for MyJKKN Application
 *
 * Defines caching strategies for different types of data based on volatility and access patterns.
 *
 * @see https://nextjs.org/docs/app/api-reference/directives/use-cache#cachelife
 */

/**
 * HOT DATA - 1 minute TTL
 *
 * Use for:
 * - Real-time payment status
 * - Live attendance tracking
 * - Active session data
 * - Current user state
 *
 * Characteristics:
 * - Changes frequently (multiple times per minute)
 * - Requires near-real-time accuracy
 * - High volatility
 */
export const cacheProfileHot = {
  stale: 60,        // 1 minute - Data considered stale after 60 seconds
  revalidate: 300,  // 5 minutes - Revalidate in background
  expire: 600       // 10 minutes - Hard expiration
};

/**
 * WARM DATA - 5 minutes TTL
 *
 * Use for:
 * - Billing invoices
 * - Student bills
 * - Receipts
 * - Student profiles (frequently accessed)
 * - Staff records
 * - Active timetables
 *
 * Characteristics:
 * - Changes moderately (several times per hour)
 * - Balance between freshness and performance
 * - Medium volatility
 */
export const cacheProfileWarm = {
  stale: 300,       // 5 minutes - Data considered stale after 5 minutes
  revalidate: 900,  // 15 minutes - Revalidate in background
  expire: 1800      // 30 minutes - Hard expiration
};

/**
 * COLD DATA - 1 hour TTL
 *
 * Use for:
 * - Institutions
 * - Departments
 * - Programs
 * - Degrees
 * - Courses (master data)
 * - Resource categories
 * - Staff categories
 *
 * Characteristics:
 * - Changes infrequently (daily or less)
 * - Master data that's relatively static
 * - Low volatility
 */
export const cacheProfileCold = {
  stale: 3600,      // 1 hour - Data considered stale after 1 hour
  revalidate: 7200, // 2 hours - Revalidate in background
  expire: 14400     // 4 hours - Hard expiration
};

/**
 * STATIC DATA - 1 day TTL
 *
 * Use for:
 * - Academic periods (rarely change)
 * - Semesters
 * - Academic years
 * - Leave types
 * - Regulations
 * - System configurations
 *
 * Characteristics:
 * - Changes very rarely (weekly or monthly)
 * - Configuration and reference data
 * - Very low volatility
 */
export const cacheProfileStatic = {
  stale: 86400,     // 1 day - Data considered stale after 24 hours
  revalidate: 172800, // 2 days - Revalidate in background
  expire: 604800    // 7 days - Hard expiration
};

/**
 * Cache profile map for easy access
 *
 * Usage:
 * ```typescript
 * import { cacheProfiles } from '@/lib/cache/cache-profiles';
 * import { cacheLife } from 'next/cache';
 *
 * cacheLife(cacheProfiles.warm);
 * ```
 */
export const cacheProfiles = {
  hot: cacheProfileHot,
  warm: cacheProfileWarm,
  cold: cacheProfileCold,
  static: cacheProfileStatic
} as const;

/**
 * Get cache profile by name
 *
 * @param profile - Name of the cache profile (hot, warm, cold, static)
 * @returns Cache profile configuration
 *
 * @example
 * ```typescript
 * const profile = getCacheProfile('warm');
 * cacheLife(profile);
 * ```
 */
export function getCacheProfile(profile: keyof typeof cacheProfiles) {
  return cacheProfiles[profile];
}

/**
 * Type definition for cache profile names
 */
export type CacheProfileName = keyof typeof cacheProfiles;
