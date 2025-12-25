import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function DashboardSkeleton() {
  return (
    <div className='space-y-3 sm:space-y-4 lg:space-y-6 px-1 sm:px-2 lg:px-4'>
      {/* BentoGrid Skeleton */}
      <div className='max-w-7xl mx-auto px-2 sm:px-4'>
        <div className='grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          <div className='sm:col-span-2 lg:col-span-2 min-h-[200px] sm:min-h-[250px] rounded-xl border bg-muted animate-pulse' />
          <div className='sm:col-span-2 lg:col-span-1 min-h-[200px] sm:min-h-[250px] rounded-xl border bg-muted animate-pulse' />
        </div>
      </div>

      {/* Controls Skeleton */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 px-2 sm:px-4'>
        <div className='flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4'>
          <Skeleton className='h-6 sm:h-7 lg:h-8 w-32 sm:w-48' />
          <Skeleton className='h-8 sm:h-9 w-full sm:w-[200px]' />
        </div>
        <Skeleton className='h-8 sm:h-9 w-full sm:w-24' />
      </div>

      {/* Widgets Grid Skeleton */}
      <div className='px-1 sm:px-2 lg:px-4'>
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6'>
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className='h-[200px] sm:h-[250px] lg:h-[300px]'>
              <CardHeader className='p-3 sm:p-4 lg:p-6'>
                <Skeleton className='h-3 sm:h-4 lg:h-6 w-20 sm:w-24 lg:w-32' />
                <Skeleton className='h-2 sm:h-3 lg:h-4 w-28 sm:w-32 lg:w-48' />
              </CardHeader>
              <CardContent className='p-3 sm:p-4 lg:p-6 pt-0'>
                <Skeleton className='h-12 sm:h-16 lg:h-24 w-full mb-2 sm:mb-3 lg:mb-4' />
                <Skeleton className='h-2 sm:h-3 lg:h-4 w-12 sm:w-16 lg:w-24' />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BentoGridSkeleton() {
  return (
    <div className='max-w-7xl mx-auto px-2 sm:px-4'>
      <div className='grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        <div className='sm:col-span-2 lg:col-span-2 min-h-[200px] sm:min-h-[250px] rounded-xl border bg-muted animate-pulse' />
        <div className='sm:col-span-2 lg:col-span-1 min-h-[200px] sm:min-h-[250px] rounded-xl border bg-muted animate-pulse' />
      </div>
    </div>
  );
}

export function DashboardWidgetsSkeleton() {
  return (
    <div className='px-1 sm:px-2 lg:px-4'>
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6'>
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className='h-[200px] sm:h-[250px] lg:h-[300px]'>
            <CardHeader className='p-3 sm:p-4 lg:p-6'>
              <Skeleton className='h-3 sm:h-4 lg:h-6 w-20 sm:w-24 lg:w-32' />
              <Skeleton className='h-2 sm:h-3 lg:h-4 w-28 sm:w-32 lg:w-48' />
            </CardHeader>
            <CardContent className='p-3 sm:p-4 lg:p-6 pt-0'>
              <Skeleton className='h-12 sm:h-16 lg:h-24 w-full mb-2 sm:mb-3 lg:mb-4' />
              <Skeleton className='h-2 sm:h-3 lg:h-4 w-12 sm:w-16 lg:w-24' />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
