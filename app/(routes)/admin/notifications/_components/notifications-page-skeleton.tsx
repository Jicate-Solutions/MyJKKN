import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function NotificationsPageSkeleton() {
  return (
    <div className='space-y-6'>
      {/* Stats Skeleton */}
      <div className='grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-2 lg:grid-cols-4'>
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <Skeleton className='h-4 w-24' />
            </CardHeader>
            <CardContent>
              <Skeleton className='h-8 w-16' />
              <Skeleton className='h-3 w-32 mt-1' />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Category Tabs Skeleton */}
      <div className='flex items-center gap-2 overflow-x-auto'>
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className='h-8 w-24 rounded-md shrink-0' />
        ))}
      </div>

      {/* Card Grid Skeleton: 3 columns × 2 rows */}
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className='relative rounded-lg border bg-card overflow-hidden'
          >
            {/* Color bar placeholder */}
            <div className='absolute left-0 top-0 bottom-0 w-1 bg-muted' />
            <div className='pl-4 pr-3 pt-3 pb-3 space-y-2'>
              <div className='flex items-center justify-between'>
                <Skeleton className='h-4 w-24 rounded' />
                <Skeleton className='h-3 w-16 rounded' />
              </div>
              <Skeleton className='h-4 w-full rounded' />
              <Skeleton className='h-3 w-5/6 rounded' />
              <Skeleton className='h-3 w-3/4 rounded' />
              <Skeleton className='h-5 w-16 rounded mt-1' />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
