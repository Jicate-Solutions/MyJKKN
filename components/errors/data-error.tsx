/**
 * Data Error Component
 *
 * Error boundary UI specifically for data fetching errors.
 * Used when server components fail to fetch data.
 */

'use client';

import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface DataErrorProps {
  /**
   * Error message to display
   */
  message?: string;
  /**
   * Optional error details
   */
  details?: string;
  /**
   * Function to retry the operation
   */
  onRetry?: () => void;
  /**
   * Show home button
   * @default true
   */
  showHomeButton?: boolean;
}

export function DataError({
  message = 'Failed to load data',
  details,
  onRetry,
  showHomeButton = true
}: DataErrorProps) {
  return (
    <div className="flex min-h-[300px] items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Data Loading Error</AlertTitle>
          <AlertDescription>
            {message}
            {details && (
              <div className="mt-2 rounded-md bg-destructive/10 p-2">
                <p className="text-xs font-mono">{details}</p>
              </div>
            )}
          </AlertDescription>
        </Alert>

        <div className="flex gap-2">
          {onRetry && (
            <Button onClick={onRetry} className="flex-1">
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          )}
          {showHomeButton && (
            <Button
              onClick={() => (window.location.href = '/')}
              variant="outline"
              className="flex-1"
            >
              <Home className="mr-2 h-4 w-4" />
              Dashboard
            </Button>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          If this problem persists, please contact support.
        </p>
      </div>
    </div>
  );
}

/**
 * Inline Data Error
 *
 * Smaller error UI for inline data loading failures
 */
export function InlineDataError({
  message = 'Failed to load',
  onRetry
}: Pick<DataErrorProps, 'message' | 'onRetry'>) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-4">
      <div className="flex items-center gap-2 text-destructive">
        <AlertCircle className="h-4 w-4" />
        <p className="text-sm font-medium">{message}</p>
      </div>
      {onRetry && (
        <Button onClick={onRetry} size="sm" variant="outline">
          <RefreshCw className="mr-2 h-3 w-3" />
          Try again
        </Button>
      )}
    </div>
  );
}
