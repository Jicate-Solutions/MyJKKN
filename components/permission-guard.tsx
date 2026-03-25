'use client';

import { ReactNode } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';

interface PermissionGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
  permissions: string[];
  requireAll?: boolean;
}

/**
 * PermissionGuard - Component that conditionally renders content based on user permissions
 *
 * @param children - Content to show when user has required permissions
 * @param fallback - Optional content to show when user lacks permissions
 * @param permissions - Array of permission keys required
 * @param requireAll - If true, user must have ALL permissions; if false, ANY permission is sufficient
 */
export function PermissionGuard({
  children,
  fallback,
  permissions,
  requireAll = true
}: PermissionGuardProps) {
  const { isLoading, error, hasAllPermissions, hasAnyPermission } =
    usePermissions(permissions);

  // Show skeleton while loading
  if (isLoading) {
    return (
      <div className='space-y-2'>
        <Skeleton className='h-4 w-full' />
        <Skeleton className='h-4 w-3/4' />
        <Skeleton className='h-4 w-1/2' />
      </div>
    );
  }

  // Show error message if permissions couldn't be loaded
  if (error) {
    return (
      <div className='flex items-center gap-2 text-destructive py-2'>
        <AlertCircle className='h-4 w-4' />
        <p className='text-sm'>Unable to verify permissions</p>
      </div>
    );
  }

  // Check permissions based on requireAll flag
  const hasPermission = requireAll ? hasAllPermissions : hasAnyPermission;

  // Return children if user has permission, otherwise fallback
  return hasPermission ? (
    <>{children}</>
  ) : (
    <>
      {fallback || (
        <div className='text-muted-foreground text-sm py-2'>
          You don&apos;t have permission to access this content
        </div>
      )}
    </>
  );
}
