import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export default function EnquiryDetailSkeleton() {
  return (
    <div className='flex flex-col lg:flex-row gap-8'>
      {/* Sidebar Skeleton */}
      <div className='w-full lg:w-64 shrink-0'>
        <Card>
          <CardContent className='p-0'>
            <div className='flex flex-col'>
              {[...Array(6)].map((_, i) => (
                <div key={i} className='flex items-center gap-3 px-4 py-3'>
                  <Skeleton className='h-4 w-4' />
                  <Skeleton className='h-4 flex-1' />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Skeleton */}
      <div className='flex-1'>
        <Card>
          <CardContent className='p-6'>
            <div className='space-y-6'>
              <div className='space-y-2'>
                <Skeleton className='h-6 w-48' />
                <Skeleton className='h-4 w-64' />
              </div>
              <div className='grid grid-cols-2 gap-4'>
                {[...Array(8)].map((_, i) => (
                  <div key={i} className='space-y-2'>
                    <Skeleton className='h-4 w-24' />
                    <Skeleton className='h-4 w-full' />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
