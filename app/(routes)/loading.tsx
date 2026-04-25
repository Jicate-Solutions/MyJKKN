/**
 * Global loading skeleton for all authenticated routes.
 *
 * Next.js convention: renders during navigation to any nested route while
 * the server-side page is resolving (Suspense boundary). Any sub-route
 * can still ship its own loading.tsx to override.
 *
 * Skeleton mimics the typical MyJKKN page chrome — a heading row, a
 * filter/action row, and a table — so the visual transition from skeleton
 * to real page is subtle instead of jumpy.
 */

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function RoutesLoading() {
  return (
    <div className='p-4 md:p-6 space-y-6' aria-label='Loading page'>
      {/* Header row — mirrors most module landing headers */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
        <div className='space-y-2'>
          <Skeleton className='h-7 w-56' />
          <Skeleton className='h-4 w-80' />
        </div>
        <div className='flex gap-2'>
          <Skeleton className='h-9 w-24' />
          <Skeleton className='h-9 w-28' />
        </div>
      </div>

      {/* Stat cards row — matches dashboards/modules that front-load KPIs */}
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className='pb-2'>
              <Skeleton className='h-4 w-24' />
            </CardHeader>
            <CardContent>
              <Skeleton className='h-8 w-20 mb-2' />
              <Skeleton className='h-3 w-32' />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter bar */}
      <div className='flex flex-wrap gap-2'>
        <Skeleton className='h-9 w-64' />
        <Skeleton className='h-9 w-32' />
        <Skeleton className='h-9 w-32' />
        <Skeleton className='h-9 w-28 ml-auto' />
      </div>

      {/* Table skeleton */}
      <Card>
        <CardContent className='p-0'>
          <div className='divide-y'>
            <div className='flex items-center gap-4 p-4 bg-muted/40'>
              <Skeleton className='h-4 w-32' />
              <Skeleton className='h-4 w-40' />
              <Skeleton className='h-4 w-24' />
              <Skeleton className='h-4 w-24 ml-auto' />
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className='flex items-center gap-4 p-4'>
                <Skeleton className='h-4 w-32' />
                <Skeleton className='h-4 w-40' />
                <Skeleton className='h-4 w-24' />
                <Skeleton className='h-4 w-24 ml-auto' />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
