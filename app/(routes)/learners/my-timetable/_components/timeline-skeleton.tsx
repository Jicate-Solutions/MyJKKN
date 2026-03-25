'use client';

/**
 * Timeline Skeleton Component
 * Created: 2026-01-14
 * Description: Loading skeleton for timetable
 */

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function TimelineSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header skeleton */}
      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-12 w-32" />
          <Skeleton className="h-9 w-24" />
        </div>
      </Card>

      {/* Cards skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-6 w-16" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-6 w-full" />
            </div>
            <div className="flex gap-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
