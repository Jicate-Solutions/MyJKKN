import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';

export default function EditUserLoading() {
  return (
    <ContentLayout title='Edit User'>
      <div className='space-y-6 mt-5'>
        <div className='flex items-center justify-between'>
          <div className='space-y-2'>
            <div className='h-6 w-32 bg-muted animate-pulse rounded' />
            <div className='h-4 w-48 bg-muted animate-pulse rounded' />
          </div>
          <div className='h-10 w-32 bg-muted animate-pulse rounded' />
        </div>

        <Card>
          <CardContent className='pt-6'>
            <div className='flex items-center justify-center min-h-[400px]'>
              <BeatLoader color='#3b82f6' size={12} />
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
