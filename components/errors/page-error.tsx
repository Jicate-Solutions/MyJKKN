/**
 * Page Error Component
 *
 * Generic error boundary UI for pages.
 * Used in error.tsx files for catching and displaying errors.
 */

'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';

interface PageErrorProps {
  /**
   * The error object
   */
  error: Error & { digest?: string };
  /**
   * Function to reset the error boundary
   */
  reset: () => void;
}

export function PageError({ error, reset }: PageErrorProps) {
  useEffect(() => {
    // Log the error to console or error reporting service
    console.error('[PageError]', error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            <CardTitle>Something went wrong</CardTitle>
          </div>
          <CardDescription>
            An unexpected error occurred while loading this page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm font-mono text-muted-foreground">
              {error.message || 'An unknown error occurred'}
            </p>
            {error.digest && (
              <p className="mt-2 text-xs text-muted-foreground">
                Error ID: {error.digest}
              </p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button onClick={reset} variant="default">
            <RefreshCcw className="mr-2 h-4 w-4" />
            Try again
          </Button>
          <Button onClick={() => window.location.href = '/'} variant="outline">
            Go to Dashboard
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

/**
 * Compact Page Error
 *
 * Smaller error UI for embedded contexts
 */
export function CompactPageError({ error, reset }: PageErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-6">
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="h-5 w-5" />
        <p className="text-sm font-medium">Error loading content</p>
      </div>
      <p className="text-center text-sm text-muted-foreground">
        {error.message || 'An unexpected error occurred'}
      </p>
      <Button onClick={reset} size="sm">
        <RefreshCcw className="mr-2 h-3 w-3" />
        Retry
      </Button>
    </div>
  );
}
