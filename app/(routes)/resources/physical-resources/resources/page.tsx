'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { ResourceList } from './_components/resource-list';
import { BeatLoader } from 'react-spinners';
import { usePermissions } from '@/hooks/use-permissions';

export default function ResourcesListPage() {
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
  const canViewResources =
    isSuperAdmin || canAccess('physical_resources', 'view');
  const canCreateResources =
    isSuperAdmin || canAccess('physical_resources', 'create');

  // Track when permissions are loaded
  useEffect(() => {
    if (!permissionsLoading) {
      console.log('Physical Resources permissions debug:', {
        isSuperAdmin,
        canViewResources: canAccess('physical_resources', 'view'),
        canCreateResources: canAccess('physical_resources', 'create')
      });
      setPermissionsLoaded(true);
    }
  }, [permissionsLoading, isSuperAdmin, canAccess]);

  useEffect(() => {
    // Only check authentication if permissions are loaded
    if (!permissionsLoaded) return;

    if (!canViewResources) {
      console.log('User does not have permission to view physical resources');
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
  }, [router, supabase.auth, permissionsLoaded, canViewResources]);

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Resources'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  // Permission check (redundant due to the redirect above, but added for safety)
  if (permissionsLoaded && !canViewResources) {
    return (
      <ContentLayout title='Resources'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to access resources
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
      <ContentLayout title='Resources'>
        <div className='flex justify-center items-center p-8'>
          <BeatLoader color='#3498db' />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Resources'>
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
    <ContentLayout title='Resources'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resources/physical-resources/dashboard'>
                Resource Management
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Resources</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Resources</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage your equipment, facilities, vehicles, and other resources
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            {canCreateResources && (
              <Button className='w-full sm:w-auto' asChild>
                <Link href='/resources/physical-resources/new'>
                  <Plus className='mr-2 h-4 w-4' />
                  Add Resource
                </Link>
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            <ResourceList />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
