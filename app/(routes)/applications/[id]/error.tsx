'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ChevronLeft, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ApplicationError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <ContentLayout title='Error'>
      <div className='flex flex-col items-center justify-center py-12'>
        <div className='flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 mb-6'>
          <AlertTriangle className='h-8 w-8 text-destructive' />
        </div>
        <h2 className='text-2xl font-bold mb-2'>Something went wrong</h2>
        <p className='text-muted-foreground mb-8 text-center max-w-md'>
          {error.message ||
            'An error occurred while loading the application details.'}
        </p>
        <div className='flex gap-4'>
          <Button variant='outline' asChild>
            <Link href='/applications'>
              <ChevronLeft className='mr-2 h-4 w-4' />
              Back to Applications
            </Link>
          </Button>
          <Button onClick={reset}>
            <RefreshCw className='mr-2 h-4 w-4' />
            Try Again
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}
