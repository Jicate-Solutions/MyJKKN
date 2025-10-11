'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { usePermissions } from '@/hooks/use-permissions';
import { BeatLoader } from 'react-spinners';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InstitutionAccessGuardProps {
  children: ReactNode;
  requiredInstitutionId?: string; // If specified, user must have access to this specific institution
  fallbackComponent?: ReactNode; // Custom fallback component
  redirectTo?: string; // Where to redirect if access is denied
  requireAnyInstitutionAccess?: boolean; // User must have access to at least one institution
  bypassForSuperAdmin?: boolean; // Whether super admins bypass the check (default: true)
  showLoadingState?: boolean; // Whether to show loading state (default: true)
  errorMessage?: string; // Custom error message
}

export function InstitutionAccessGuard({
  children,
  requiredInstitutionId,
  fallbackComponent,
  redirectTo = '/unauthorized',
  requireAnyInstitutionAccess = false,
  bypassForSuperAdmin = true,
  showLoadingState = true,
  errorMessage
}: InstitutionAccessGuardProps) {
  const router = useRouter();
  const { profile, isLoading: authLoading } = useAuth();
  const {
    institutions,
    loading: institutionLoading,
    hasAccessToInstitution
  } = useUserInstitutionAccess();
  const { isSuperAdmin } = usePermissions();
  const [hasCheckedAccess, setHasCheckedAccess] = useState(false);

  useEffect(() => {
    if (authLoading || institutionLoading) {
      return;
    }

    // If user is not authenticated, let the auth system handle it
    if (!profile) {
      setHasCheckedAccess(true);
      return;
    }

    // Super admin bypass
    if (bypassForSuperAdmin && isSuperAdmin) {
      setHasCheckedAccess(true);
      return;
    }

    // Check specific institution access
    if (requiredInstitutionId) {
      if (!hasAccessToInstitution(requiredInstitutionId)) {
        if (redirectTo) {
          router.push(redirectTo);
          return;
        }
      }
    }

    // Check if user needs access to any institution
    if (requireAnyInstitutionAccess && institutions.length === 0) {
      if (redirectTo) {
        router.push(redirectTo);
        return;
      }
    }

    setHasCheckedAccess(true);
  }, [
    profile,
    authLoading,
    institutionLoading,
    isSuperAdmin,
    requiredInstitutionId,
    institutions.length,
    hasAccessToInstitution,
    requireAnyInstitutionAccess,
    bypassForSuperAdmin,
    redirectTo,
    router
  ]);

  // Show loading state while checking access
  if (
    !hasCheckedAccess &&
    showLoadingState &&
    (authLoading || institutionLoading)
  ) {
    return (
      <div className='flex items-center justify-center min-h-[400px]'>
        <div className='text-center'>
          <BeatLoader color='#00e902' />
          <p className='mt-4 text-muted-foreground'>
            Checking access permissions...
          </p>
        </div>
      </div>
    );
  }

  // If not authenticated, show children (let auth guard handle it)
  if (!profile) {
    return <>{children}</>;
  }

  // Super admin bypass
  if (bypassForSuperAdmin && isSuperAdmin) {
    return <>{children}</>;
  }

  // Check access conditions
  const hasRequiredInstitutionAccess = requiredInstitutionId
    ? hasAccessToInstitution(requiredInstitutionId)
    : true;

  const hasAnyInstitutionAccess = requireAnyInstitutionAccess
    ? institutions.length > 0
    : true;

  const hasAccess = hasRequiredInstitutionAccess && hasAnyInstitutionAccess;

  if (!hasAccess) {
    if (fallbackComponent) {
      return <>{fallbackComponent}</>;
    }

    return (
      <div className='flex items-center justify-center min-h-[400px] p-4'>
        <Card className='w-full max-w-md'>
          <CardContent className='p-6 text-center'>
            <div className='flex flex-col items-center space-y-4'>
              <div className='rounded-full bg-red-100 p-3'>
                <Lock className='h-8 w-8 text-red-600' />
              </div>
              <div className='space-y-2'>
                <h3 className='text-lg font-semibold'>Access Restricted</h3>
                <p className='text-sm text-muted-foreground'>
                  {errorMessage || getDefaultErrorMessage()}
                </p>
              </div>
              {redirectTo && (
                <Button
                  variant='outline'
                  onClick={() => router.push(redirectTo)}
                  className='mt-4'
                >
                  Go Back
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;

  function getDefaultErrorMessage(): string {
    if (
      requiredInstitutionId &&
      !hasAccessToInstitution(requiredInstitutionId)
    ) {
      return 'You do not have access to the required institution for this resource.';
    }

    if (requireAnyInstitutionAccess && institutions.length === 0) {
      return 'You do not have access to any institutions. Please contact your administrator.';
    }

    return 'You do not have sufficient permissions to access this resource.';
  }
}

// Higher-order component version for easier use
export function withInstitutionAccess<P extends object>(
  Component: React.ComponentType<P>,
  guardProps?: Omit<InstitutionAccessGuardProps, 'children'>
) {
  return function InstitutionAccessWrappedComponent(props: P) {
    return (
      <InstitutionAccessGuard {...guardProps}>
        <Component {...props} />
      </InstitutionAccessGuard>
    );
  };
}

// Hook for checking institution access in components
export function useInstitutionAccessCheck(options?: {
  requiredInstitutionId?: string;
  requireAnyInstitutionAccess?: boolean;
  bypassForSuperAdmin?: boolean;
}) {
  const { profile } = useAuth();
  const { institutions, hasAccessToInstitution } = useUserInstitutionAccess();
  const { isSuperAdmin } = usePermissions();

  const {
    requiredInstitutionId,
    requireAnyInstitutionAccess = false,
    bypassForSuperAdmin = true
  } = options || {};

  // Super admin bypass
  if (bypassForSuperAdmin && isSuperAdmin) {
    return {
      hasAccess: true,
      reason: 'super_admin_bypass'
    };
  }

  // Check specific institution access
  if (requiredInstitutionId) {
    const hasSpecificAccess = hasAccessToInstitution(requiredInstitutionId);
    if (!hasSpecificAccess) {
      return {
        hasAccess: false,
        reason: 'missing_institution_access',
        requiredInstitutionId
      };
    }
  }

  // Check if user needs access to any institution
  if (requireAnyInstitutionAccess && institutions.length === 0) {
    return {
      hasAccess: false,
      reason: 'no_institution_access'
    };
  }

  return {
    hasAccess: true,
    reason: 'access_granted'
  };
}
