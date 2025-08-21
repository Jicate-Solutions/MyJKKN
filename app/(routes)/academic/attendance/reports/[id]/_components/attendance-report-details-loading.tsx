import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AttendanceReportDetailsLoading() {
  return (
    <div className='space-y-6'>
      {/* Header with navigation and actions */}
      <div className='flex items-center justify-between'>
        <Button variant='outline' disabled>
          <ArrowLeft className='h-4 w-4 mr-2' />
          Back to Reports
        </Button>

        <div className='flex items-center gap-2'>
          <Skeleton className='h-9 w-20' />
          <Skeleton className='h-9 w-28' />
          <Skeleton className='h-9 w-20' />
        </div>
      </div>

      {/* Report Header */}
      <Card>
        <CardHeader>
          <div className='space-y-2'>
            <Skeleton className='h-8 w-96' />
            <Skeleton className='h-4 w-64' />
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid grid-cols-2 md:grid-cols-4 gap-6'>
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className='space-y-2'>
                <Skeleton className='h-4 w-20' />
                <Skeleton className='h-6 w-32' />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className='grid gap-4 md:grid-cols-3'>
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <div className='flex items-center justify-between'>
                <Skeleton className='h-6 w-24' />
                <Skeleton className='h-8 w-8 rounded-full' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='space-y-2'>
                <Skeleton className='h-8 w-16' />
                <Skeleton className='h-2 w-full' />
                <Skeleton className='h-4 w-20' />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Students List */}
      <Card>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <Skeleton className='h-6 w-32' />
            <div className='flex gap-2'>
              <Skeleton className='h-9 w-24' />
              <Skeleton className='h-9 w-20' />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className='space-y-3'>
            {/* Table Header */}
            <div className='flex items-center space-x-4 border-b pb-2'>
              <Skeleton className='h-4 w-32' />
              <Skeleton className='h-4 w-24' />
              <Skeleton className='h-4 w-20' />
              <Skeleton className='h-4 w-28' />
              <Skeleton className='h-4 w-16' />
            </div>

            {/* Table Rows */}
            {Array.from({ length: 20 }).map((_, index) => (
              <div key={index} className='flex items-center space-x-4 py-2'>
                <Skeleton className='h-4 w-32' />
                <Skeleton className='h-4 w-24' />
                <Skeleton className='h-4 w-20' />
                <Skeleton className='h-4 w-28' />
                <Skeleton className='h-6 w-16 rounded' />
              </div>
            ))}
          </div>

          {/* Pagination Loading */}
          <div className='flex items-center justify-between pt-4 border-t'>
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
