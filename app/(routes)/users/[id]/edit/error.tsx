'use client';

import { useEffect } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, ArrowLeft } from 'lucide-react';

export default function EditUserError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('User edit error:', error);
  }, [error]);

  return (
    <ContentLayout title='Edit User - Error'>
      <div className='space-y-6 mt-5'>
        <Card>
          <CardContent className='pt-6'>
            <div className='flex flex-col items-center justify-center min-h-[400px] space-y-4'>
              <AlertTriangle className='h-12 w-12 text-destructive' />
              <h2 className='text-lg font-semibold'>Something went wrong!</h2>
              <p className='text-muted-foreground text-center max-w-md'>
                {error.message ||
                  'An error occurred while loading the user edit page.'}
              </p>
              <div className='flex gap-2'>
                <Button onClick={reset} variant='default'>
                  Try again
                </Button>
                <Button onClick={() => window.history.back()} variant='outline'>
                  <ArrowLeft className='mr-2 h-4 w-4' />
                  Go back
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
