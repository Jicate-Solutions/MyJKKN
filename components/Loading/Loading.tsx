import React from 'react';
import { ContentLayout } from '../layout/content-layout';
import { BeatLoader } from 'react-spinners';

interface LoadingProps {
  title: string;
}

const Loading = ({ title }: LoadingProps) => {
  return (
    <ContentLayout title={title}>
      <div className='flex items-center justify-center min-h-[400px]'>
        <BeatLoader color='#00e902' />
      </div>
    </ContentLayout>
  );
};

export default Loading;
