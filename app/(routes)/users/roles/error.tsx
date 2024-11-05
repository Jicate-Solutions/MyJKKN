// app/(routes)/users/error.tsx
'use client';

import { Button } from '@/components/ui/button';
import { ContentLayout } from '@/components/layout/content-layout';

export default function UsersError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ContentLayout title='Error'>
      <div className='flex flex-col items-center justify-center min-h-[400px]'>
        <h2 className='text-xl font-bold mb-4'>Something went wrong!</h2>
        <p className='text-muted-foreground mb-4'>{error.message}</p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </ContentLayout>
  );
}
