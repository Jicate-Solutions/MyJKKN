// app/(routes)/staff/page.tsx

'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { BeatLoader } from 'react-spinners';
import { useStaff } from '@/hooks/staff/use-staff';
import { StaffFilters } from './_components/staff-filters';
import { StaffList } from './_components/staff-list';
import DownloadStaffTemplateButton from './_components/download-staff-template';
import BulkUploadStaff from './_components/bulk-upload-staff';
import ExportStaff from './_components/export-staff';
import { CreateMissingProfilesButton } from './_components/create-missing-profiles-button';
import { usePermissions } from '@/hooks/use-permissions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, Users, AlertCircle, RefreshCw, Bug } from 'lucide-react';
import { BulkUploadStaffImages } from './_components/bulk-upload-staff-images';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';

export default function StaffPage() {
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [forceShowContent, setForceShowContent] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [loadingStartTime] = useState(Date.now());
  const [connectivityTestResult, setConnectivityTestResult] =
    useState<any>(null);
  const [isTestingConnectivity, setIsTestingConnectivity] = useState(false);

  // Initialize the staff hook with stable initial filters
  const initialFilters = useMemo(() => ({}), []);

  const {
    staff,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchStaff,
    updateLimit
  } = useStaff(initialFilters);

  const { user, isLoading: authLoading, error: authError, profile } = useAuth();

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading,
    error: permissionsError
  } = usePermissions();

  const canViewStaff = isSuperAdmin || canAccess('staff', 'view');
  const canCreateStaff = isSuperAdmin || canAccess('staff', 'create');
  const canEditStaff = isSuperAdmin || canAccess('staff', 'edit');

  // Add a fallback timeout to prevent infinite loading
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (permissionsLoading) {
        console.warn('Permissions loading timeout, forcing content display');
        setForceShowContent(true);
        setShowDiagnostics(true);
      }
    }, 15000); // 15 second timeout

    return () => clearTimeout(timeoutId);
  }, [permissionsLoading]);

  // Auto-show diagnostics in production if loading takes too long
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      const diagnosticsTimeout = setTimeout(() => {
        if (permissionsLoading || authLoading) {
          setShowDiagnostics(true);
        }
      }, 8000); // Show diagnostics after 8 seconds in production

      return () => clearTimeout(diagnosticsTimeout);
    }
  }, [permissionsLoading, authLoading]);

  // Handle page change with loading state
  const handlePageChange = async (page: number) => {
    setPaginationLoading(true);
    try {
      await changePage(page);
    } finally {
      setPaginationLoading(false);
    }
  };

  // Handle page size change
  const handlePageSizeChange = async (pageSize: number) => {
    setPaginationLoading(true);
    try {
      await updateLimit(pageSize);
    } finally {
      setPaginationLoading(false);
    }
  };

  // Handle refresh
  const handleRefresh = async () => {
    try {
      await fetchStaff();
    } catch (err) {
      console.error('Error refreshing staff data:', err);
    }
  };

  const runConnectivityTest = async () => {
    setIsTestingConnectivity(true);
    setConnectivityTestResult(null);
    try {
      const response = await fetch('/api/debug/auth-test');
      const data = await response.json();
      setConnectivityTestResult(data);
    } catch (error) {
      setConnectivityTestResult({
        error: 'Fetch failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsTestingConnectivity(false);
    }
  };

  // Add debugging for refresh issues
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('StaffPage render:', {
        permissionsLoading,
        loading,
        staffCount: staff?.length,
        error,
        canViewStaff,
        forceShowContent
      });
    }
  }, [
    permissionsLoading,
    loading,
    staff?.length,
    error,
    canViewStaff,
    forceShowContent
  ]);

  // Diagnostic information
  const diagnosticInfo = {
    loadingDuration: Math.round((Date.now() - loadingStartTime) / 1000),
    authLoading,
    permissionsLoading,
    hasUser: !!profile,
    userRole: profile?.role,
    authError: authError,
    permissionsError: permissionsError?.message,
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  };

  // Show loading state while permissions are being determined (unless forced)
  if (permissionsLoading && !forceShowContent) {
    return (
      <ContentLayout title='Staff List'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <div className='text-center'>
            <BeatLoader color='#00e902' />
            <p className='mt-4 text-sm text-muted-foreground'>
              Loading permissions...
            </p>
            <p className='mt-2 text-xs text-muted-foreground'>
              {Math.round((Date.now() - loadingStartTime) / 1000)}s elapsed
            </p>
            <div className='flex gap-2 mt-4'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setForceShowContent(true)}
              >
                Skip Loading
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setShowDiagnostics(!showDiagnostics)}
              >
                <Bug className='w-4 h-4 mr-2' />
                {showDiagnostics ? 'Hide' : 'Show'} Debug
              </Button>
            </div>

            {showDiagnostics && (
              <Card className='mt-4 max-w-md mx-auto'>
                <CardContent className='p-4'>
                  <h3 className='font-medium mb-2'>Loading Diagnostics</h3>
                  <div className='text-xs text-left space-y-1'>
                    <div>Duration: {diagnosticInfo.loadingDuration}s</div>
                    <div>Auth Loading: {String(authLoading)}</div>
                    <div>Permissions Loading: {String(permissionsLoading)}</div>
                    <div>Has Profile: {String(diagnosticInfo.hasUser)}</div>
                    <div>User Role: {diagnosticInfo.userRole || 'None'}</div>
                    <div>Environment: {diagnosticInfo.environment}</div>
                    {authError && (
                      <div className='text-red-500'>
                        Auth Error: {authError}
                      </div>
                    )}
                    {permissionsError && (
                      <div className='text-red-500'>
                        Permissions Error: {permissionsError.message}
                      </div>
                    )}
                  </div>
                  <Button
                    size='sm'
                    variant='secondary'
                    className='mt-4 w-full'
                    onClick={runConnectivityTest}
                    disabled={isTestingConnectivity}
                  >
                    {isTestingConnectivity
                      ? 'Testing...'
                      : 'Run Connectivity Test'}
                  </Button>
                  {connectivityTestResult && (
                    <pre className='text-xs mt-2 bg-muted p-2 rounded text-left'>
                      {JSON.stringify(connectivityTestResult, null, 2)}
                    </pre>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </ContentLayout>
    );
  }

  // Show access denied if user doesn't have permissions (and not forced)
  if (!canViewStaff && !forceShowContent) {
    return (
      <ContentLayout title='Staff List'>
        <div className='p-4'>
          <Alert variant='destructive'>
            <AlertCircle className='h-4 w-4' />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You don&apos;t have permission to view the staff list.
            </AlertDescription>
          </Alert>
        </div>
      </ContentLayout>
    );
  }

  // Show error state with better error handling
  if (error) {
    console.error('[StaffPage] Render Error:', error);
    return (
      <ContentLayout title='Staff List'>
        <div className='p-4'>
          <Alert variant='destructive'>
            <AlertCircle className='h-4 w-4' />
            <AlertTitle>Error Loading Staff</AlertTitle>
            <AlertDescription>
              <div className='space-y-2'>
                <p>{error || 'An unexpected error occurred.'}</p>
                {error?.includes('54001') && (
                  <p className='text-sm'>
                    This appears to be a database configuration issue. Please
                    contact support.
                  </p>
                )}
                <Button
                  variant='outline'
                  size='sm'
                  onClick={handleRefresh}
                  className='mt-4'
                  disabled={loading}
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`}
                  />
                  Try Again
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Staff List'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Staff List</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {forceShowContent && (
        <Alert className='mt-4'>
          <Info className='h-4 w-4' />
          <AlertTitle>Debug Mode</AlertTitle>
          <AlertDescription>
            Loading was skipped. Some features may not work correctly.
            {showDiagnostics && (
              <details className='mt-2'>
                <summary className='cursor-pointer'>
                  Show Diagnostic Info
                </summary>
                <pre className='text-xs mt-2 bg-muted p-2 rounded'>
                  {JSON.stringify(diagnosticInfo, null, 2)}
                </pre>
              </details>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 justify-between items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Staff List</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage staff members
            </p>
          </div>

          {/* Additional Tools Row */}
          <div className='flex flex-col sm:flex-row gap-2 sm:items-end w-full'>
            {(canEditStaff || forceShowContent) && (
              <DownloadStaffTemplateButton />
            )}
            {(isSuperAdmin || forceShowContent) && <ExportStaff />}
            {(isSuperAdmin ||
              canAccess('user', 'create') ||
              forceShowContent) && <CreateMissingProfilesButton />}
            {(canEditStaff || forceShowContent) && <BulkUploadStaff />}
            {(canEditStaff || forceShowContent) && <BulkUploadStaffImages />}
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            <StaffFilters filters={filters} onFilterChange={updateFilters} />

            {/* Filter-based count display */}
            <div className='flex items-center justify-between mb-4 p-3 bg-muted/30 rounded-lg border'>
              <div className='flex items-center gap-2'>
                <div className='flex items-center gap-1'>
                  <Users className='h-4 w-4 text-muted-foreground' />
                  <span className='text-sm font-medium'>
                    {loading ? (
                      <span className='flex items-center gap-2'>
                        <BeatLoader size={8} color='#00e902' />
                        Loading...
                      </span>
                    ) : (
                      <>
                        Showing {staff?.length || 0} of{' '}
                        <span className='font-semibold text-primary'>
                          {metadata.total || 0}
                        </span>{' '}
                        staff member{metadata.total !== 1 ? 's' : ''}
                        {metadata.total > 0 && (
                          <span className='text-muted-foreground'>
                            {' '}
                            (Page {metadata.page} of {metadata.totalPages})
                          </span>
                        )}
                      </>
                    )}
                  </span>
                </div>
                {!loading && metadata.total > 0 && (
                  <Badge variant='secondary' className='ml-2'>
                    {(
                      ((staff?.length || 0) / (metadata.total || 1)) *
                      100
                    ).toFixed(1)}
                    % of total
                  </Badge>
                )}
              </div>
              {!loading && metadata.total === 0 && (
                <div className='text-sm text-muted-foreground'>
                  No staff members found matching the current filters
                </div>
              )}
            </div>

            {loading && !paginationLoading ? (
              <div className='flex justify-center items-center p-8'>
                <div className='text-center'>
                  <BeatLoader color='#00e902' />
                  <p className='mt-4 text-sm text-muted-foreground'>
                    Loading staff data...
                  </p>
                </div>
              </div>
            ) : (
              <StaffList
                staff={staff}
                metadata={metadata}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                onRefresh={handleRefresh}
                canEdit={canEditStaff || forceShowContent}
                paginationLoading={paginationLoading}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
