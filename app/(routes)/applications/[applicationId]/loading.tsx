// app/(routes)/applications/[applicationId]/loading.tsx
import { BeatLoader } from 'react-spinners';
import { ContentLayout } from '@/components/layout/content-layout';

export default function Loading() {
  return (
    <ContentLayout title='Loading...'>
      <div className='flex items-center justify-center min-h-[400px]'>
        <BeatLoader color='#00e902' />
      </div>
    </ContentLayout>
  );
}
