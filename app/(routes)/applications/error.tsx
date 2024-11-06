// app/(routes)/applications/error.tsx
'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ContentLayout } from '@/components/layout/content-layout';

export default function Error({
  error,
  reset
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <ContentLayout title='Error'>
      <div className='flex flex-col items-center justify-center min-h-[400px]'>
        <h2 className='text-xl font-semibold mb-4'>Something went wrong!</h2>
        <Button onClick={reset}>Try again</Button>
      </div>
    </ContentLayout>
  );
}
