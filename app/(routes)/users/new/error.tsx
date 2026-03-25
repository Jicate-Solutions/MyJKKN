'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ContentLayout } from '@/components/layout/content-layout';
import { AlertCircle } from 'lucide-react';

export default function NewUserError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('New user page error:', error);
  }, [error]);

  return (
    <ContentLayout title='Error'>
      <div className='flex flex-col items-center justify-center min-h-[400px] text-center'>
        <AlertCircle className='h-10 w-10 text-destructive mb-4' />
        <h2 className='text-2xl font-bold mb-2'>Something went wrong!</h2>
        <p className='text-muted-foreground mb-6'>
          {error.message || 'An error occurred while creating the user.'}
        </p>
        <div className='flex gap-4'>
          <Button onClick={() => reset()}>Try again</Button>
          <Button variant='outline' onClick={() => window.history.back()}>
            Go back
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}
