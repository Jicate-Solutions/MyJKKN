'use client';

/**
 * Loading skeleton for SignalCard.
 * Matches the card layout structure for smooth content shift.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface SignalCardSkeletonProps {
  count?: number;
}

export function SignalCardSkeleton({ count = 4 }: SignalCardSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="border-l-4 border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1">
                <Skeleton className="h-4 w-32 mb-1.5" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-8 w-12 rounded-lg" />
            </div>
            <div className="flex items-center gap-1.5 mb-3">
              {Array.from({ length: 7 }).map((_, j) => (
                <Skeleton key={j} className="h-2.5 w-2.5 rounded-full" />
              ))}
            </div>
            <Skeleton className="h-3 w-40" />
          </CardContent>
        </Card>
      ))}
    </>
  );
}
