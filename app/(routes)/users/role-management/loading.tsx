import { ContentLayout } from '@/components/layout/content-layout';
import { BeatLoader } from 'react-spinners';

export default function RoleManagementLoading() {
  return (
    <ContentLayout title='Role Management'>
      <div className='flex items-center justify-center min-h-[400px]'>
        <BeatLoader color='#00e902' />
      </div>
    </ContentLayout>
  );
}
