import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function AttendanceReportsLoading() {
  return (
    <div className='space-y-4'>
      {/* Filters Loading */}
      <Card>
        <CardHeader>
          <Skeleton className='h-6 w-32' />
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
            <Skeleton className='h-10 w-full' />
            <Skeleton className='h-10 w-full' />
            <Skeleton className='h-10 w-full' />
            <Skeleton className='h-10 w-full' />
          </div>
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
            <Skeleton className='h-10 w-full' />
            <Skeleton className='h-10 w-full' />
            <Skeleton className='h-10 w-full' />
            <Skeleton className='h-10 w-full' />
          </div>
          <div className='flex gap-2'>
            <Skeleton className='h-10 w-24' />
            <Skeleton className='h-10 w-24' />
            <Skeleton className='h-10 w-24' />
          </div>
        </CardContent>
      </Card>

      {/* Table Loading */}
      <Card>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <Skeleton className='h-6 w-48' />
            <Skeleton className='h-9 w-32' />
          </div>
        </CardHeader>
        <CardContent>
          <div className='space-y-3'>
            {/* Table Header */}
            <div className='flex items-center space-x-4 border-b pb-2'>
              <Skeleton className='h-4 w-24' />
              <Skeleton className='h-4 w-32' />
              <Skeleton className='h-4 w-28' />
              <Skeleton className='h-4 w-20' />
              <Skeleton className='h-4 w-24' />
              <Skeleton className='h-4 w-16' />
            </div>

            {/* Table Rows */}
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={index} className='flex items-center space-x-4 py-2'>
                <Skeleton className='h-4 w-24' />
                <Skeleton className='h-4 w-32' />
                <Skeleton className='h-4 w-28' />
                <Skeleton className='h-4 w-20' />
                <Skeleton className='h-4 w-24' />
                <Skeleton className='h-4 w-16' />
                <Skeleton className='h-8 w-8 rounded-full' />
              </div>
            ))}
          </div>

          {/* Pagination Loading */}
          <div className='flex items-center justify-between pt-4'>
            <Skeleton className='h-4 w-32' />
            <div className='flex items-center space-x-2'>
              <Skeleton className='h-8 w-8' />
              <Skeleton className='h-8 w-8' />
              <Skeleton className='h-8 w-8' />
              <Skeleton className='h-8 w-8' />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
