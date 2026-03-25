/**
 * Page Skeleton Component
 *
 * Generic loading skeleton for pages while data is being fetched.
 * Used in Suspense fallback for server components.
 */

import { Skeleton } from '@/components/ui/skeleton';

export function PageSkeleton() {
  return (
    <div className="flex flex-col space-y-6 p-6">
      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>

      {/* Content skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

/**
 * Compact Page Skeleton
 *
 * Smaller loading skeleton for detail pages or modals
 */
export function CompactPageSkeleton() {
  return (
    <div className="flex flex-col space-y-4 p-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
