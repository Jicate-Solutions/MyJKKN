'use client';

/**
 * ProjectDetailSkeleton
 *
 * Shown while the project query is in-flight on a cold navigation.
 * Mirrors the structure of the loaded page (header card + workspace nav grid +
 * board columns) so the layout doesn't jump when data arrives.
 * Added as part of perf(projects/detail) — first-paint improvement.
 */

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function ProjectDetailSkeleton() {
  return (
    <>
      {/* Header card */}
      <Card className="mt-6">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-2">
            {/* Title + badges row */}
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            {/* Code */}
            <Skeleton className="h-3.5 w-24" />
            {/* Dates + progress row */}
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          {/* Edit button */}
          <Skeleton className="h-8 w-16 rounded-md" />
        </CardHeader>
      </Card>

      {/* Workspace nav */}
      <div className="mt-6">
        <Skeleton className="mb-3 h-4 w-20" />
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-11">
          {Array.from({ length: 11 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      </div>

      {/* Tabs + board columns */}
      <div className="mt-6">
        <div className="flex gap-1">
          <Skeleton className="h-9 w-16 rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
        </div>
        <div className="mt-6 flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-96 w-[280px] shrink-0 rounded-lg" />
          ))}
        </div>
      </div>
    </>
  );
}
