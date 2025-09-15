'use client';

import React, { Component, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertTriangle,
  RefreshCw,
  Home,
  Bug,
  Mail,
  ExternalLink,
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  showDetails: boolean;
  retryCount: number;
}

interface BillingErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

export class BillingErrorBoundary extends Component<BillingErrorBoundaryProps, ErrorBoundaryState> {
  private maxRetries = 3;

  constructor(props: BillingErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      error,
      errorInfo
    });

    // Log error to console
    console.error('Billing Error Boundary caught an error:', error, errorInfo);

    // Call onError callback if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // In production, you might want to log this to an error reporting service
    // logErrorToService(error, errorInfo);
  }

  handleRetry = () => {
    const { retryCount } = this.state;

    if (retryCount < this.maxRetries) {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        showDetails: false,
        retryCount: retryCount + 1
      });
    }
  };

  handleGoHome = () => {
    window.location.href = '/learner/dashboard';
  };

  handleReportError = () => {
    const { error, errorInfo } = this.state;
    const errorReport = {
      error: error?.toString(),
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    // In a real app, you'd send this to your error reporting service
    console.log('Error report:', errorReport);

    // For now, we'll create a mailto link
    const subject = encodeURIComponent('Billing Module Error Report');
    const body = encodeURIComponent(`
Error Report:
${JSON.stringify(errorReport, null, 2)}

Please describe what you were doing when this error occurred:
[Please add your description here]
    `);

    window.open(`mailto:support@jkkn.edu.in?subject=${subject}&body=${body}`);
  };

  toggleDetails = () => {
    this.setState(prevState => ({
      showDetails: !prevState.showDetails
    }));
  };

  render() {
    const { hasError, error, errorInfo, showDetails, retryCount } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      // You can render any custom fallback UI
      if (fallback) {
        return fallback;
      }

      const canRetry = retryCount < this.maxRetries;
      const errorMessage = error?.message || 'An unexpected error occurred';
      const isNetworkError = error?.message?.includes('fetch') || error?.message?.includes('network');
      const isDataError = error?.message?.includes('data') || error?.message?.includes('parse');

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <Card className="max-w-2xl w-full">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-3 bg-red-100 rounded-full w-fit">
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
              <CardTitle className="text-2xl text-gray-900">
                Oops! Something went wrong
              </CardTitle>
              <p className="text-gray-600 mt-2">
                We encountered an error while loading your billing information.
              </p>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Error Type Alert */}
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {isNetworkError && (
                    <>
                      <strong>Connection Error:</strong> Unable to connect to the billing service.
                      Please check your internet connection and try again.
                    </>
                  )}
                  {isDataError && (
                    <>
                      <strong>Data Error:</strong> There was a problem processing your billing data.
                      This is usually temporary.
                    </>
                  )}
                  {!isNetworkError && !isDataError && (
                    <>
                      <strong>Application Error:</strong> {errorMessage}
                    </>
                  )}
                </AlertDescription>
              </Alert>

              {/* Quick Fix Suggestions */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Quick fixes to try:
                </h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Refresh the page or try again</li>
                  <li>• Check your internet connection</li>
                  <li>• Clear your browser cache</li>
                  <li>• Try accessing from a different browser</li>
                </ul>
              </div>

              {/* Retry Information */}
              {retryCount > 0 && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Retry attempts: {retryCount} of {this.maxRetries}
                    {!canRetry && ' (Maximum retries reached)'}
                  </AlertDescription>
                </Alert>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                {canRetry && (
                  <Button onClick={this.handleRetry} className="flex-1">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Try Again
                  </Button>
                )}

                <Button variant="outline" onClick={this.handleGoHome} className="flex-1">
                  <Home className="h-4 w-4 mr-2" />
                  Go to Dashboard
                </Button>

                <Button variant="outline" onClick={this.handleReportError} className="flex-1">
                  <Bug className="h-4 w-4 mr-2" />
                  Report Error
                </Button>
              </div>

              {/* Error Details Toggle */}
              <div className="border-t pt-4">
                <Button
                  variant="ghost"
                  onClick={this.toggleDetails}
                  className="w-full justify-between"
                >
                  <span>Technical Details</span>
                  {showDetails ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>

                {showDetails && (
                  <div className="mt-4 space-y-4">
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Error Message:</h4>
                      <div className="bg-gray-100 p-3 rounded text-sm font-mono">
                        {errorMessage}
                      </div>
                    </div>

                    {error?.stack && (
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Stack Trace:</h4>
                        <div className="bg-gray-100 p-3 rounded text-xs font-mono max-h-32 overflow-y-auto">
                          {error.stack}
                        </div>
                      </div>
                    )}

                    {errorInfo?.componentStack && (
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Component Stack:</h4>
                        <div className="bg-gray-100 p-3 rounded text-xs font-mono max-h-32 overflow-y-auto">
                          {errorInfo.componentStack}
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-gray-500">
                      <p>Timestamp: {new Date().toISOString()}</p>
                      <p>URL: {window.location.href}</p>
                      <p>User Agent: {navigator.userAgent}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Support Information */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-2">Need Help?</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    <span>Email: support@jkkn.edu.in</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4" />
                    <span>Support Portal: help.jkkn.edu.in</span>
                  </div>
                  <p className="text-xs mt-2">
                    When contacting support, please include the technical details above
                    and describe what you were doing when the error occurred.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return children;
  }
}

// Hook version for functional components
export function useBillingErrorHandler() {
  const handleError = (error: Error, errorInfo: React.ErrorInfo) => {
    console.error('Billing error handled:', error, errorInfo);

    // You could dispatch to a global error state here
    // or send to an error reporting service
  };

  return { handleError };
}

// HOC version for wrapping components
export function withBillingErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<BillingErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <BillingErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </BillingErrorBoundary>
  );

  WrappedComponent.displayName = `withBillingErrorBoundary(${Component.displayName || Component.name})`;

  return WrappedComponent;
}