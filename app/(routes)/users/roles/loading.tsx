// app/(routes)/users/roles/loading.tsx
import { ContentLayout } from '@/components/layout/content-layout';
import { BeatLoader } from 'react-spinners';

export default function RolesLoading() {
  return (
    <ContentLayout title='Roles & Permissions'>
      <div className='flex items-center justify-center min-h-[400px]'>
        <BeatLoader color='#00e902' />
      </div>
    </ContentLayout>
  );
}
