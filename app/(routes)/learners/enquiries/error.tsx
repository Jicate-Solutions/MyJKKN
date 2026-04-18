'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ContentLayout } from '@/components/layout/content-layout';

export default function EnquiriesError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[learners/enquiries] Render error:', error);
  }, [error]);

  return (
    <ContentLayout title='Admission Management'>
      <div className='flex flex-col items-center justify-center min-h-[400px] p-6 text-center'>
        <div className='bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-full p-4 mb-4'>
          <AlertTriangle className='h-10 w-10 text-red-600' />
        </div>
        <h2 className='text-2xl font-bold mb-2'>Unable to load enquiries</h2>
        <p className='text-muted-foreground max-w-md mb-2'>
          We hit a snag loading this page. Your data is safe — this is usually
          a temporary issue.
        </p>
        {error.digest && (
          <p className='text-xs text-muted-foreground mb-6 font-mono'>
            Error ID: {error.digest}
          </p>
        )}
        <div className='flex gap-3'>
          <Button onClick={reset} variant='default'>
            <RefreshCw className='h-4 w-4 mr-2' />
            Try Again
          </Button>
          <Button asChild variant='outline'>
            <Link href='/'>
              <Home className='h-4 w-4 mr-2' />
              Go Home
            </Link>
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}
