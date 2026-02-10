'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card } from '@/components/ui/card';
import { useApplications } from '@/hooks/use-applications';
import { ApplicationHubFilters } from './_components/application-hub-filters';
import { CategoryService } from '@/lib/services/application/category-service';
import { Category } from '@/types/categories';
import { BeatLoader } from 'react-spinners';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { ApplicationGrid } from './_components/application-grid';
import { useAuth } from '@/hooks/use-auth';
import { Application } from '@/types/applications';
import { Button } from '@/components/ui/button';
import { AlertCircle, Bug, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { usePermissions } from '@/hooks/use-permissions';

export default function ApplicationHubPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const { profile, isLoading: isLoadingUser } = useAuth();
  const [filteredApplications, setFilteredApplications] = useState<
    Application[]
  >([]);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const { isSuperAdmin } = usePermissions();
  const {
    applications,
    loading,
    error,
    filters,
    updateFilters,
    fetchApplications
  } = useApplications({ limit: 1000, isActive: true }); // Fetch only active applications for hub

  // Filter applications based on user role and active status
  useEffect(() => {
    if (loading || isLoadingUser) return; // Don't filter while still loading

    // If no user, don't show any applications
    if (!profile) {
      console.warn('[application-hub] No user found, showing no applications');
      setFilteredApplications([]);
      return;
    }

    if (!applications.length) {
      setFilteredApplications([]);
      return;
    }

    const userRole = profile.role;

    // Filter for active applications with role-based access
    const filtered = applications.filter((app) => {
      // Safety check: Ensure application is active (should already be filtered by API)
      if (!app.is_active) {
        return false;
      }

      // Super admin can see all active applications
      if (isSuperAdmin) {
        return true;
      }

      // Make sure roles_access exists and is an array
      if (!app.roles_access || !Array.isArray(app.roles_access)) {
        console.warn(
          `[application-hub] Application ${app.name} has invalid roles_access:`,
          app.roles_access
        );
        return false;
      }

      // Empty roles_access array means application is public for all authenticated users
      if (app.roles_access.length === 0) {
        return true;
      }

      // Check if user's role is in the roles_access array
      const hasAccess = app.roles_access.includes(userRole);
      return hasAccess;
    });

    setFilteredApplications(filtered);
  }, [applications, profile, loading, isLoadingUser, isSuperAdmin]);

  // Load categories and applications on initial render
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoadingCategories(true);
        const data = await CategoryService.getCategories();
        setCategories(data);
      } catch (error) {
        console.error('Error loading categories:', error);
        toast.error('Failed to load categories');
      } finally {
        setLoadingCategories(false);
      }
    };

    loadData();
    fetchApplications();
  }, [fetchApplications]);

  // Handle manual refresh
  const handleRefresh = async () => {
    try {
      toast.loading('Refreshing applications...');
      await fetchApplications();
      toast.success('Applications refreshed');
    } catch (error) {
      console.error('Error refreshing applications:', error);
      toast.error('Failed to refresh applications');
    }
  };

  // Add debug function
  const handleDebug = async () => {
    try {
      toast.loading('Loading debug info...');
      const response = await fetch('/api/debug/applications');
      const data = await response.json();
      setDebugInfo(data);
      setIsDebugOpen(true);
      toast.dismiss();
    } catch (error) {
      console.error('Error fetching debug info:', error);
      toast.error('Failed to load debug information');
    }
  };

  if (loadingCategories || loading || isLoadingUser) {
    return (
      <ContentLayout title='Application Hub'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Application Hub'>
        <div className='text-center min-h-[400px] flex flex-col justify-center items-center'>
          <div className='mb-4'>
            <AlertCircle className='h-12 w-12 text-destructive mx-auto mb-4' />
            <h2 className='text-xl font-semibold text-destructive mb-2'>
              Error Loading Applications
            </h2>
            <p className='text-lg text-muted-foreground max-w-md mx-auto mb-4'>
              {error}
            </p>
          </div>
          <Button
            onClick={handleRefresh}
            variant='outline'
            className='flex items-center gap-2'
          >
            <RefreshCw className='h-4 w-4' />
            <span>Try Again</span>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Application Hub'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Application Hub</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-2'>
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Application Hub</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Discover and access all available applications for your role
              {profile && (
                <span className='font-medium'> ({profile.role})</span>
              )}
            </p>
          </div>
          <div className='flex gap-2'>
            <Button
              onClick={handleRefresh}
              variant='outline'
              size='sm'
              className='flex items-center gap-2'
            >
              <RefreshCw className='h-4 w-4' />
              <span className='hidden sm:inline'>Refresh</span>
            </Button>

            {isSuperAdmin && (
              <Button
                onClick={handleDebug}
                variant='ghost'
                size='sm'
                className='flex items-center gap-2'
              >
                <Bug className='h-4 w-4' />
                <span className='hidden sm:inline'>Debug</span>
              </Button>
            )}
          </div>
        </div>

        <Card className='p-6'>
          <ApplicationHubFilters
            categories={categories}
            filters={filters}
            onFilterChange={updateFilters}
            userRole={profile?.role}
          />

          <ApplicationGrid
            applications={filteredApplications}
            userRole={profile?.role}
          />

          {applications.length > 0 && filteredApplications.length === 0 && (
            <div className='py-8 text-center'>
              <p className='text-muted-foreground'>
                No active applications available for your role ({profile?.role || 'unknown'}).
              </p>
              <p className='text-sm text-muted-foreground mt-1'>
                Contact your administrator to request access to applications.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Debug Dialog */}
      <Dialog open={isDebugOpen} onOpenChange={setIsDebugOpen}>
        <DialogContent className='max-w-3xl max-h-[80vh] overflow-auto'>
          <DialogHeader>
            <DialogTitle>Application Hub Debug Information</DialogTitle>
            <DialogDescription>
              This information can help diagnose application access issues.
            </DialogDescription>
          </DialogHeader>

          {debugInfo ? (
            <div className='space-y-4 mt-4'>
              <h3 className='text-lg font-semibold'>User Information</h3>
              <div className='bg-slate-50 dark:bg-slate-900 p-4 rounded'>
                <pre className='text-xs overflow-auto'>
                  {JSON.stringify(debugInfo.user, null, 2)}
                </pre>
              </div>

              <h3 className='text-lg font-semibold'>Profile Information</h3>
              <div className='bg-slate-50 dark:bg-slate-900 p-4 rounded'>
                <pre className='text-xs overflow-auto'>
                  {JSON.stringify(debugInfo.profile, null, 2)}
                </pre>
              </div>

              <h3 className='text-lg font-semibold'>Applications Access</h3>
              <div className='bg-slate-50 dark:bg-slate-900 p-4 rounded'>
                <pre className='text-xs overflow-auto'>
                  {JSON.stringify(debugInfo.applications, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div className='py-4'>Loading debug information...</div>
          )}
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
