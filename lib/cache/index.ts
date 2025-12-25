/**
 * Cache Module - Central Exports
 *
 * Provides a centralized import point for all cache-related utilities.
 *
 * @example
 * ```typescript
 * import { cacheProfiles, cacheTags } from '@/lib/cache';
 * ```
 */

// Re-export Next.js cache functions
export { cacheLife, cacheTag } from 'next/cache';
export { revalidatePath, revalidateTag } from 'next/cache';

// Export cache profiles
export {
  cacheProfiles,
  getCacheProfile,
  cacheProfileHot,
  cacheProfileWarm,
  cacheProfileCold,
  cacheProfileStatic,
  type CacheProfileName
} from './cache-profiles';

// Export cache tags
export {
  CACHE_TAG_PREFIXES,
  cacheTags,
  cacheInvalidation,
  type CacheTagPrefix
} from './cache-tags';
