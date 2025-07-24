import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function NotificationsPageSkeleton() {
  return (
    <div className='space-y-6'>
      {/* Stats Skeleton */}
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
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

      {/* Table Skeleton */}
      <Card>
        <CardHeader>
          <div className='flex justify-between items-center'>
            <div className='space-y-2'>
              <Skeleton className='h-5 w-48' />
              <Skeleton className='h-4 w-80' />
            </div>
            <Skeleton className='h-10 w-64' />
          </div>
        </CardHeader>
        <CardContent>
          <div className='space-y-2'>
            {/* Table Header */}
            <Skeleton className='h-12 w-full' />
            {/* Table Rows */}
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className='h-16 w-full' />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
