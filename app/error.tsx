// app/error.tsx
'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className='flex flex-col items-center justify-center min-h-screen p-4'>
      <h2 className='text-2xl font-bold mb-4'>Something went wrong!</h2>
      <p className='text-muted-foreground mb-4'>{error.message}</p>
      <div className='flex gap-4'>
        <Button onClick={() => window.location.reload()}>Refresh Page</Button>
        <Button onClick={() => reset()} variant='outline'>
          Try Again
        </Button>
      </div>
    </div>
  );
}
