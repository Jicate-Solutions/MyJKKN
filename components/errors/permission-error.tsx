/**
 * Permission Error Component
 *
 * Error UI for permission denied / unauthorized access.
 * Used when users try to access routes or resources they don't have permission for.
 */

'use client';

import { ShieldAlert, ArrowLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';

interface PermissionErrorProps {
  /**
   * Custom message to display
   */
  message?: string;
  /**
   * Required permission(s) for this resource
   */
  requiredPermission?: string | string[];
  /**
   * Show go back button
   * @default true
   */
  showBackButton?: boolean;
}

export function PermissionError({
  message = 'You do not have permission to access this resource',
  requiredPermission,
  showBackButton = true
}: PermissionErrorProps) {
  const handleGoBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/';
    }
  };

  return (
    <div className="flex min-h-[500px] items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-warning" />
            <CardTitle>Access Denied</CardTitle>
          </div>
          <CardDescription>
            {message}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requiredPermission && (
            <div className="rounded-lg border border-warning/20 bg-warning/10 p-4">
              <p className="text-sm font-medium">Required Permission:</p>
              <div className="mt-2">
                {Array.isArray(requiredPermission) ? (
                  <ul className="list-disc list-inside space-y-1">
                    {requiredPermission.map((perm, i) => (
                      <li key={i} className="text-sm font-mono">
                        {perm}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm font-mono">{requiredPermission}</p>
                )}
              </div>
            </div>
          )}
          <p className="mt-4 text-sm text-muted-foreground">
            If you believe you should have access to this resource, please
            contact your system administrator.
          </p>
        </CardContent>
        <CardFooter className="flex gap-2">
          {showBackButton && (
            <Button onClick={handleGoBack} variant="default">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go back
            </Button>
          )}
          <Button onClick={() => (window.location.href = '/')} variant="outline">
            <Home className="mr-2 h-4 w-4" />
            Dashboard
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

/**
 * Inline Permission Error
 *
 * Smaller error UI for inline permission checks
 */
export function InlinePermissionError({
  message = 'Access denied'
}: Pick<PermissionErrorProps, 'message'>) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
      <ShieldAlert className="h-8 w-8 text-warning" />
      <div>
        <p className="font-medium">{message}</p>
        <p className="text-sm text-muted-foreground mt-1">
          You don't have permission to view this content
        </p>
      </div>
    </div>
  );
}
