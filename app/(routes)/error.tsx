'use client';

/**
 * Global error boundary for all authenticated routes.
 *
 * Next.js convention: any `error.tsx` under app/(routes)/ catches errors
 * thrown by the segment's children (pages + nested layouts). Nothing per-
 * page needs to wire this up — dropping this one file gives every route
 * a consistent error UI.
 *
 * If a sub-route ships its own `error.tsx` (e.g. app/(routes)/solutions/
 * error.tsx) that one wins for errors inside that subtree — this file
 * catches everything else.
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RoutesError({ error, reset }: ErrorProps) {
  const pathname = usePathname();

  useEffect(() => {
    // Surface the raw error in devtools. enhanced-logger isn't used here
    // because error.tsx must remain self-contained (no async imports, no
    // side effects that could themselves throw).
    // eslint-disable-next-line no-console
    console.error('[routes/error-boundary]', {
      pathname,
      message: error.message,
      digest: error.digest,
      stack: error.stack
    });
  }, [error, pathname]);

  const handleReportBug = () => {
    // The floating BugReporterWidget is mounted in app/(routes)/layout.tsx,
    // which still renders around this error boundary. Dispatching a custom
    // event lets a future widget version auto-open with the pathname + error
    // pre-filled. Until the widget listens for it, the user can still click
    // the corner Bug button manually.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('open-bug-reporter', {
          detail: {
            source: 'error-boundary',
            pathname,
            errorMessage: error.message,
            errorDigest: error.digest
          }
        })
      );
    }
  };

  return (
    <div className='flex items-center justify-center min-h-[60vh] p-4'>
      <Card className='w-full max-w-lg'>
        <CardHeader className='text-center'>
          <AlertTriangle className='h-12 w-12 text-destructive mx-auto mb-4' />
          <CardTitle>Something went wrong</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <p className='text-center text-muted-foreground'>
            {error.message ||
              'An unexpected error occurred while loading this page.'}
          </p>
          {pathname && (
            <p className='text-center text-xs text-muted-foreground font-mono break-all'>
              Path: {pathname}
            </p>
          )}
          {error.digest && (
            <p className='text-center text-xs text-muted-foreground'>
              Error ID: <span className='font-mono'>{error.digest}</span>
            </p>
          )}
          <div className='flex flex-wrap gap-3 justify-center pt-2'>
            <Button onClick={reset} variant='default'>
              <RefreshCw className='mr-2 h-4 w-4' />
              Try Again
            </Button>
            <Button onClick={handleReportBug} variant='outline'>
              <Bug className='mr-2 h-4 w-4' />
              Report Bug
            </Button>
            <Button asChild variant='ghost'>
              <Link href='/dashboard'>
                <Home className='mr-2 h-4 w-4' />
                Go to Dashboard
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
