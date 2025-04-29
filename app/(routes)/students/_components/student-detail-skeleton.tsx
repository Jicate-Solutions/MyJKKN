import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function StudentDetailSkeleton() {
  return (
    <div className='space-y-6'>
      {/* Basic Info Card */}
      <Card>
        <CardHeader className='pb-3'>
          <Skeleton className='h-5 w-1/4 mb-2' />
          <Skeleton className='h-4 w-1/3' />
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
            <div className='space-y-4'>
              <div className='flex justify-center'>
                <Skeleton className='h-32 w-32 rounded-full' />
              </div>
              <Skeleton className='h-4 w-full' />
              <Skeleton className='h-4 w-3/4 mx-auto' />
            </div>

            <div className='space-y-4 md:col-span-2'>
              <Skeleton className='h-5 w-1/4 mb-2' />
              <div className='grid grid-cols-2 gap-4'>
                <Skeleton className='h-4 w-full' />
                <Skeleton className='h-4 w-full' />
                <Skeleton className='h-4 w-full' />
                <Skeleton className='h-4 w-full' />
                <Skeleton className='h-4 w-full' />
                <Skeleton className='h-4 w-full' />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Details Tab Card */}
      <Card>
        <CardHeader className='pb-3'>
          <Skeleton className='h-5 w-1/3 mb-2' />
          <Skeleton className='h-4 w-1/2' />
        </CardHeader>
        <CardContent>
          <div className='space-y-4'>
            <div className='flex space-x-2'>
              <Skeleton className='h-10 w-24' />
              <Skeleton className='h-10 w-24' />
              <Skeleton className='h-10 w-24' />
              <Skeleton className='h-10 w-24' />
            </div>

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4 pt-4'>
              <div className='space-y-4'>
                <Skeleton className='h-5 w-1/3' />
                <div className='space-y-2'>
                  <Skeleton className='h-4 w-full' />
                  <Skeleton className='h-4 w-full' />
                  <Skeleton className='h-4 w-full' />
                  <Skeleton className='h-4 w-full' />
                </div>
              </div>

              <div className='space-y-4'>
                <Skeleton className='h-5 w-1/3' />
                <div className='space-y-2'>
                  <Skeleton className='h-4 w-full' />
                  <Skeleton className='h-4 w-full' />
                  <Skeleton className='h-4 w-full' />
                  <Skeleton className='h-4 w-full' />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
