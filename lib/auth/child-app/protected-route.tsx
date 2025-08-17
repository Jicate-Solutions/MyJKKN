'use client';

import React, { ReactNode, useEffect } from 'react';
import { useAuth, useIsAuthenticated } from './auth-context';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  fallback?: ReactNode;
  redirectTo?: string;
  requiredPermissions?: string[];
  requiredRoles?: string[];
  requireAnyRole?: boolean;
  onUnauthorized?: () => void;
  loadingComponent?: ReactNode;
}

/**
 * Protected Route Component
 * Ensures user is authenticated before rendering children
 */
export function ProtectedRoute({
  children,
  fallback,
  redirectTo,
  requiredPermissions = [],
  requiredRoles = [],
  requireAnyRole = true,
  onUnauthorized,
  loadingComponent
}: ProtectedRouteProps) {
  const {
    isAuthenticated,
    isLoading,
    login,
    hasPermission,
    hasRole,
    hasAnyRole
  } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      if (redirectTo) {
        login(redirectTo);
      } else {
        login(window.location.href);
      }
    }
  }, [isLoading, isAuthenticated, redirectTo, login]);

  // Check authorization
  const checkAuthorization = (): boolean => {
    if (!isAuthenticated) return false;

    // Check permissions
    for (const permission of requiredPermissions) {
      if (!hasPermission(permission)) {
        return false;
      }
    }

    // Check roles
    if (requiredRoles.length > 0) {
      if (requireAnyRole) {
        // User must have at least one of the required roles
        if (!hasAnyRole(requiredRoles)) {
          return false;
        }
      } else {
        // User must have all required roles
        for (const role of requiredRoles) {
          if (!hasRole(role)) {
            return false;
          }
        }
      }
    }

    return true;
  };

  // Show loading state
  if (isLoading) {
    if (loadingComponent) {
      return <>{loadingComponent}</>;
    }

    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className='flex flex-col items-center gap-4'>
          <Loader2 className='h-8 w-8 animate-spin text-primary' />
          <p className='text-muted-foreground'>Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Check if user is authorized
  const isAuthorized = checkAuthorization();

  if (!isAuthorized) {
    if (onUnauthorized) {
      onUnauthorized();
    }

    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className='text-center'>
          <h2 className='text-2xl font-bold text-red-600 mb-2'>
            Access Denied
          </h2>
          <p className='text-muted-foreground'>
            You don&apos;t have permission to access this page.
          </p>
        </div>
      </div>
    );
  }

  // User is authenticated and authorized
  return <>{children}</>;
}

/**
 * With Authentication HOC
 * Higher-order component to wrap components that require authentication
 */
export function withAuth<P extends object>(
  Component: React.ComponentType<P>,
  options?: Omit<ProtectedRouteProps, 'children'>
) {
  return function AuthenticatedComponent(props: P) {
    return (
      <ProtectedRoute {...options}>
        <Component {...props} />
      </ProtectedRoute>
    );
  };
}

/**
 * Require Auth Component
 * Simple wrapper that only checks authentication
 */
export function RequireAuth({
  children,
  redirectTo
}: {
  children: ReactNode;
  redirectTo?: string;
}) {
  return <ProtectedRoute redirectTo={redirectTo}>{children}</ProtectedRoute>;
}

/**
 * Require Permission Component
 * Checks for specific permissions
 */
export function RequirePermission({
  children,
  permission,
  fallback
}: {
  children: ReactNode;
  permission: string | string[];
  fallback?: ReactNode;
}) {
  const permissions = Array.isArray(permission) ? permission : [permission];

  return (
    <ProtectedRoute requiredPermissions={permissions} fallback={fallback}>
      {children}
    </ProtectedRoute>
  );
}

/**
 * Require Role Component
 * Checks for specific roles
 */
export function RequireRole({
  children,
  role,
  requireAll = false,
  fallback
}: {
  children: ReactNode;
  role: string | string[];
  requireAll?: boolean;
  fallback?: ReactNode;
}) {
  const roles = Array.isArray(role) ? role : [role];

  return (
    <ProtectedRoute
      requiredRoles={roles}
      requireAnyRole={!requireAll}
      fallback={fallback}
    >
      {children}
    </ProtectedRoute>
  );
}

/**
 * Guest Only Component
 * Only renders for non-authenticated users
 */
export function GuestOnly({
  children,
  redirectTo = '/'
}: {
  children: ReactNode;
  redirectTo?: string;
}) {
  const isAuthenticated = useIsAuthenticated();
  const { isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      window.location.href = redirectTo;
    }
  }, [isLoading, isAuthenticated, redirectTo]);

  if (isLoading) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <Loader2 className='h-8 w-8 animate-spin text-primary' />
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Conditional Auth Component
 * Renders different content based on auth state
 */
export function ConditionalAuth({
  authenticated,
  unauthenticated,
  loading
}: {
  authenticated: ReactNode;
  unauthenticated: ReactNode;
  loading?: ReactNode;
}) {
  const isAuthenticated = useIsAuthenticated();
  const { isLoading } = useAuth();

  if (isLoading) {
    return <>{loading || <Loader2 className='h-6 w-6 animate-spin' />}</>;
  }

  return <>{isAuthenticated ? authenticated : unauthenticated}</>;
}
