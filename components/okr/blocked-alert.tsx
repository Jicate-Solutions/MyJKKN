'use client';

// components/okr/blocked-alert.tsx
// NON-DISMISSIBLE alert shown when user is blocked due to missing OKR check-in
// This component CANNOT be closed - user MUST complete check-in to proceed

import { AlertTriangle, Clock, ArrowRight, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useOKRDeadline } from '@/hooks/okr/use-okr-blocker';

interface BlockedAlertProps {
  /** Message explaining why the user is blocked */
  message: string;
  /** URL to the check-in page */
  actionUrl: string;
  /** Additional CSS classes */
  className?: string;
  /** Badge color indicating severity */
  badgeColor?: 'yellow' | 'red' | 'blocked';
  /** Number of days overdue */
  daysOverdue?: number;
  /** Whether to show as a full page block or inline */
  variant?: 'full-page' | 'inline' | 'banner';
}

/**
 * BlockedAlert Component
 *
 * A non-dismissible alert that blocks users from proceeding until they
 * complete their weekly OKR check-in.
 *
 * DESIGN PRINCIPLES:
 * - Cannot be dismissed or closed
 * - Prominently displays the issue
 * - Provides clear action path
 * - Shows urgency based on severity
 */
export function BlockedAlert({
  message,
  actionUrl,
  className,
  badgeColor = 'red',
  daysOverdue = 0,
  variant = 'inline'
}: BlockedAlertProps) {
  const deadline = useOKRDeadline();

  // Severity-based styling
  const severityConfig = {
    yellow: {
      bg: 'bg-yellow-50 dark:bg-yellow-950',
      border: 'border-yellow-500',
      text: 'text-yellow-800 dark:text-yellow-200',
      icon: Clock,
      iconColor: 'text-yellow-600 dark:text-yellow-400',
      title: 'Check-In Reminder',
      buttonVariant: 'outline' as const
    },
    red: {
      bg: 'bg-red-50 dark:bg-red-950',
      border: 'border-red-500',
      text: 'text-red-800 dark:text-red-200',
      icon: AlertTriangle,
      iconColor: 'text-red-600 dark:text-red-400',
      title: 'OKR Check-In Overdue',
      buttonVariant: 'destructive' as const
    },
    blocked: {
      bg: 'bg-red-100 dark:bg-red-900',
      border: 'border-red-700',
      text: 'text-red-900 dark:text-red-100',
      icon: XCircle,
      iconColor: 'text-red-700 dark:text-red-300',
      title: 'ACCESS BLOCKED',
      buttonVariant: 'destructive' as const
    }
  };

  const config = severityConfig[badgeColor];
  const Icon = config.icon;

  // Full page blocking view
  if (variant === 'full-page') {
    return (
      <div className={cn(
        'min-h-[60vh] flex items-center justify-center p-6',
        className
      )}>
        <Card className={cn(
          'max-w-lg w-full border-2',
          config.border,
          config.bg
        )}>
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-4">
              <div className={cn(
                'p-4 rounded-full',
                badgeColor === 'blocked' ? 'bg-red-200 dark:bg-red-800' : 'bg-red-100 dark:bg-red-900'
              )}>
                <Icon className={cn('h-12 w-12', config.iconColor)} />
              </div>
            </div>
            <CardTitle className={cn('text-2xl', config.text)}>
              {config.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            <p className={cn('text-base', config.text)}>
              {message}
            </p>

            {daysOverdue > 0 && (
              <div className={cn(
                'inline-flex items-center gap-2 px-4 py-2 rounded-full',
                badgeColor === 'blocked' ? 'bg-red-200 dark:bg-red-800' : 'bg-red-100 dark:bg-red-900'
              )}>
                <Clock className="h-4 w-4 text-red-700 dark:text-red-300" />
                <span className="text-sm font-semibold text-red-700 dark:text-red-300">
                  {daysOverdue} day{daysOverdue > 1 ? 's' : ''} overdue
                </span>
              </div>
            )}

            <div className="pt-4">
              <Button
                asChild
                variant={config.buttonVariant}
                size="lg"
                className="w-full"
              >
                <Link href={actionUrl}>
                  Complete Check-In Now
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              You cannot proceed until your OKR check-in is completed.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Banner style (for page headers)
  if (variant === 'banner') {
    return (
      <div className={cn(
        'w-full border-b-2 py-4 px-6',
        config.border,
        config.bg,
        className
      )}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Icon className={cn('h-6 w-6 flex-shrink-0', config.iconColor)} />
            <div>
              <span className={cn('font-semibold', config.text)}>
                {config.title}:
              </span>
              <span className={cn('ml-2', config.text)}>
                {message}
              </span>
            </div>
          </div>
          <Button
            asChild
            variant={config.buttonVariant}
            size="sm"
          >
            <Link href={actionUrl}>
              Complete Check-In
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // Inline card style (default)
  return (
    <Card className={cn(
      'border-2',
      config.border,
      config.bg,
      className
    )}>
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className={cn(
            'p-2 rounded-full flex-shrink-0',
            badgeColor === 'blocked' ? 'bg-red-200 dark:bg-red-800' : 'bg-red-100 dark:bg-red-900'
          )}>
            <Icon className={cn('h-6 w-6', config.iconColor)} />
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <h3 className={cn('font-semibold text-lg', config.text)}>
                {config.title}
              </h3>
              <p className={cn('text-sm mt-1', config.text)}>
                {message}
              </p>
            </div>

            {daysOverdue > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <Clock className={cn('h-4 w-4', config.iconColor)} />
                <span className={config.text}>
                  {daysOverdue} day{daysOverdue > 1 ? 's' : ''} overdue
                </span>
              </div>
            )}

            <Button
              asChild
              variant={config.buttonVariant}
              className="mt-2"
            >
              <Link href={actionUrl}>
                Complete Check-In Now
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Wrapper component that conditionally renders children or BlockedAlert
 * Use this to wrap entire page content
 */
interface OKRBlockerWrapperProps {
  children: React.ReactNode;
  isBlocked: boolean;
  isLoading?: boolean;
  blockMessage: string;
  checkInUrl: string;
  badgeColor?: 'yellow' | 'red' | 'blocked';
  daysOverdue?: number;
  variant?: 'full-page' | 'inline' | 'banner';
  loadingComponent?: React.ReactNode;
}

export function OKRBlockerWrapper({
  children,
  isBlocked,
  isLoading = false,
  blockMessage,
  checkInUrl,
  badgeColor = 'red',
  daysOverdue = 0,
  variant = 'full-page',
  loadingComponent
}: OKRBlockerWrapperProps) {
  if (isLoading) {
    return loadingComponent ?? (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-pulse text-muted-foreground">
          Checking OKR compliance...
        </div>
      </div>
    );
  }

  if (isBlocked) {
    return (
      <BlockedAlert
        message={blockMessage}
        actionUrl={checkInUrl}
        badgeColor={badgeColor}
        daysOverdue={daysOverdue}
        variant={variant}
      />
    );
  }

  return <>{children}</>;
}

/**
 * Higher-Order Component version for wrapping entire pages
 */
export function withOKRBlocker<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options: {
    variant?: 'full-page' | 'inline' | 'banner';
  } = {}
) {
  return function OKRProtectedComponent(props: P) {
    // Note: This is a pattern example - actual implementation would need the hook
    // For pages, prefer using the OKRBlockerWrapper directly
    return <WrappedComponent {...props} />;
  };
}
