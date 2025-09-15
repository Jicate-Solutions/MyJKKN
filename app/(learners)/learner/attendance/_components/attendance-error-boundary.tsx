'use client';

import React, { ErrorInfo, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, RefreshCw, Home, MessageCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class AttendanceErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo });

    // Log error to console
    console.error('Attendance module error:', error, errorInfo);

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // In production, you might want to send this to an error reporting service
    // Example: Sentry.captureException(error, { contexts: { react: errorInfo } });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  handleGoHome = () => {
    window.location.href = '/learner';
  };

  handleReportError = () => {
    const errorReport = {
      error: this.state.error?.message,
      stack: this.state.error?.stack,
      componentStack: this.state.errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    // Copy error report to clipboard
    navigator.clipboard.writeText(JSON.stringify(errorReport, null, 2));
    alert('Error report copied to clipboard. Please send this to support.');
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className='min-h-[400px] flex items-center justify-center p-4'>
          <Card className='w-full max-w-2xl'>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-red-600'>
                <AlertTriangle className='h-5 w-5' />
                Attendance Module Error
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <Alert variant='destructive'>
                <AlertTriangle className='h-4 w-4' />
                <AlertDescription>
                  Something went wrong while loading your attendance data. This could be due to a temporary issue with the system.
                </AlertDescription>
              </Alert>

              {/* Error details for development */}
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className='mt-4 p-4 bg-gray-100 rounded-lg'>
                  <h4 className='font-semibold text-sm mb-2'>Error Details (Development)</h4>
                  <pre className='text-xs overflow-x-auto whitespace-pre-wrap text-red-600'>
                    {this.state.error.message}
                  </pre>
                  {this.state.error.stack && (
                    <details className='mt-2'>
                      <summary className='cursor-pointer text-xs font-semibold'>Stack Trace</summary>
                      <pre className='text-xs mt-2 overflow-x-auto whitespace-pre-wrap'>
                        {this.state.error.stack}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className='flex flex-col sm:flex-row gap-3 pt-4'>
                <Button
                  onClick={this.handleRetry}
                  className='flex items-center gap-2'
                  variant='default'
                >
                  <RefreshCw className='h-4 w-4' />
                  Try Again
                </Button>

                <Button
                  onClick={this.handleGoHome}
                  variant='outline'
                  className='flex items-center gap-2'
                >
                  <Home className='h-4 w-4' />
                  Go to Dashboard
                </Button>

                <Button
                  onClick={this.handleReportError}
                  variant='outline'
                  className='flex items-center gap-2'
                >
                  <MessageCircle className='h-4 w-4' />
                  Report Error
                </Button>
              </div>

              {/* Help text */}
              <div className='text-sm text-gray-600 mt-4 p-3 bg-blue-50 rounded-lg'>
                <h4 className='font-semibold mb-2'>What you can do:</h4>
                <ul className='list-disc list-inside space-y-1 text-xs'>
                  <li>Try refreshing the page or clicking &quot;Try Again&quot;</li>
                  <li>Check your internet connection</li>
                  <li>Clear your browser cache and cookies</li>
                  <li>Try accessing the page later if the issue persists</li>
                  <li>Contact support if the problem continues</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook version for functional components
export function useErrorHandler() {
  return (error: Error, errorInfo?: ErrorInfo) => {
    console.error('Attendance error caught by hook:', error, errorInfo);

    // In production, send to error reporting service
    // Example: Sentry.captureException(error, { contexts: { react: errorInfo } });
  };
}

// Fallback component for specific sections
export function AttendanceFallback({
  title = 'Unable to load attendance data',
  message = 'There was an error loading this section. Please try refreshing the page.',
  onRetry,
  showRetry = true
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  showRetry?: boolean;
}) {
  return (
    <Card className='border-red-200'>
      <CardContent className='p-6 text-center'>
        <AlertTriangle className='h-12 w-12 text-red-500 mx-auto mb-4' />
        <h3 className='font-semibold text-lg mb-2'>{title}</h3>
        <p className='text-gray-600 mb-4'>{message}</p>
        {showRetry && (
          <Button onClick={onRetry} variant='outline' className='flex items-center gap-2 mx-auto'>
            <RefreshCw className='h-4 w-4' />
            Retry
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// Loading fallback component
export function AttendanceLoadingFallback({
  title = 'Loading attendance data...',
  description = 'Please wait while we fetch your attendance records.'
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Card>
      <CardContent className='p-6 text-center'>
        <div className='animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4'></div>
        <h3 className='font-semibold text-lg mb-2'>{title}</h3>
        <p className='text-gray-600'>{description}</p>
      </CardContent>
    </Card>
  );
}