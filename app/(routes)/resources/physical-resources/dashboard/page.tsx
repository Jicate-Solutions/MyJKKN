'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { ResourceStatsDashboard } from '../_components/resource-stats-dashboard';
import { BeatLoader } from 'react-spinners';
import { usePermissions } from '@/hooks/use-permissions';

export default function ResourcesPage() {
  const router = useRouter();
  const supabase = createClientSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  // Get permissions with waitForLoad option to ensure they're fully loaded
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions([], { waitForLoad: true });

  // Define access permissions
  const canViewDashboard =
    isSuperAdmin || canAccess('physical_resources.dashboard', 'view');

  // Track when permissions are loaded
  useEffect(() => {
    if (!permissionsLoading) {
      console.log('Physical Resources Dashboard permissions debug:', {
        isSuperAdmin,
        canViewDashboard: canAccess('physical_resources.dashboard', 'view')
      });
      setPermissionsLoaded(true);
    }
  }, [permissionsLoading, isSuperAdmin, canAccess]);

  useEffect(() => {
    // Only check authentication if the user has permission to view the dashboard
    if (!permissionsLoaded) return;

    if (!canViewDashboard) {
      console.log(
        'User does not have permission to view physical resources dashboard'
      );
      router.push('/unauthorized');
      return;
    }

    const checkSession = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();

        if (error || !data.user) {
          router.push('/auth/login');
          return;
        }

        setLoading(false);
      } catch (error) {
        console.error('Error checking authentication:', error);
        setError('Authentication error. Please try again.');
        setLoading(false);
      }
    };

    checkSession();
  }, [router, supabase.auth, permissionsLoaded, canViewDashboard]);

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Resource Management'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  // Permission check (this is redundant due to the redirect above, but added for safety)
  if (permissionsLoaded && !canViewDashboard) {
    return (
      <ContentLayout title='Resource Management'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to access the resource management
            dashboard
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/'>Go to Dashboard</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (loading) {
    return (
      <ContentLayout title='Resource Management'>
        <div className='flex justify-center items-center p-8'>
          <BeatLoader color='#3498db' />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Resource Management'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => router.push('/auth/login')}
            className='mt-4'
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Resource Management'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Resource Management</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Resource Management</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage and track all resources across your institutions
            </p>
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            <ResourceStatsDashboard />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
