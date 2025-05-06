'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Loader2, AlertTriangle } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'react-hot-toast';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import DigitalResourceList from './_components/digital-resource-list';
import { usePermissions } from '@/hooks/use-permissions';

export default function DigitalResourcesListPage() {
  const router = useRouter();

  // Authentication state
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Permissions state
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions([], { waitForLoad: true });
  const [error, setError] = useState<string | null>(null);
  const isLoading = authLoading || permissionsLoading;

  // Specific permission checks
  const canViewResources =
    isSuperAdmin || canAccess('digital_resources', 'view');
  const canCreateResources =
    isSuperAdmin || canAccess('digital_resources', 'create');
  const canEditResources =
    isSuperAdmin || canAccess('digital_resources', 'edit');
  const canDeleteResources =
    isSuperAdmin || canAccess('digital_resources', 'delete');
  const canReserveResources =
    isSuperAdmin || canAccess('digital_resources.reservations', 'create');

  // Initialize Supabase and check auth state
  useEffect(() => {
    const supabase = createClientSupabaseClient();

    // Check auth on component mount
    const checkAuth = async () => {
      try {
        setAuthLoading(true);
        const { data: sessionData } = await supabase.auth.getSession();

        if (sessionData?.session) {
          console.log(
            'Resources List: Auth session found:',
            sessionData.session.user.id
          );
          setUser(sessionData.session.user);
        } else {
          console.log('Resources List: No session found, trying to get user');
          const { data } = await supabase.auth.getUser();
          if (data?.user) {
            console.log('Resources List: User found:', data.user.id);
            setUser(data.user);
          } else {
            console.log('Resources List: No authenticated user found');
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Resources List: Auth check error:', error);
        setUser(null);
        setError('Authentication error. Please try again.');
      } finally {
        setAuthLoading(false);
      }
    };

    // Check auth immediately
    checkAuth();

    // Setup auth state change listener
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('Resources List: Auth state changed:', event);
        if (session) {
          console.log('Resources List: New session user:', session.user.id);
          setUser(session.user);
        } else {
          setUser(null);
        }
      }
    );

    // Cleanup
    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // Debug permissions once they're loaded
  useEffect(() => {
    if (!permissionsLoading) {
      console.log('Digital resources list permissions debug:', {
        isSuperAdmin,
        canViewResources: canAccess('digital_resources', 'view'),
        canCreateResources: canAccess('digital_resources', 'create'),
        canEditResources: canAccess('digital_resources', 'edit'),
        canDeleteResources: canAccess('digital_resources', 'delete'),
        canReserveResources: canAccess(
          'digital_resources.reservations',
          'create'
        )
      });
    }
  }, [permissionsLoading, isSuperAdmin, canAccess]);

  // Redirect if not allowed to view resources
  useEffect(() => {
    if (!isLoading && (!user || !canViewResources)) {
      if (!user) {
        toast.error('You must be logged in to view digital resources');
        router.push('/login');
      } else if (!canViewResources) {
        toast.error('You do not have permission to view digital resources');
        router.push('/resources/digital-resources');
      }
    }
  }, [user, isLoading, canViewResources, router]);

  if (isLoading) {
    return (
      <ContentLayout title='Digital Resources'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
          <span className='ml-2'>Loading...</span>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Digital Resources'>
        <div className='text-center py-8'>
          <AlertTriangle className='h-12 w-12 text-amber-500 mx-auto mb-4' />
          <p className='text-destructive text-xl font-medium'>Error</p>
          <p className='text-muted-foreground mb-4'>{error}</p>
          <Button
            variant='outline'
            onClick={() => router.push('/login')}
            className='mt-4'
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  // If not authenticated, show error state
  if (!user) {
    return (
      <ContentLayout title='Digital Resources'>
        <div className='text-center py-8'>
          <AlertTriangle className='h-12 w-12 text-amber-500 mx-auto mb-4' />
          <p className='text-destructive text-xl font-medium'>
            Authentication Required
          </p>
          <p className='text-muted-foreground mb-4'>
            You must be logged in to view digital resources
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/login'>Go to Login</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!canViewResources) {
    return (
      <ContentLayout title='Digital Resources'>
        <div className='text-center py-8'>
          <AlertTriangle className='h-12 w-12 text-amber-500 mx-auto mb-4' />
          <p className='text-destructive text-xl font-medium'>Access Denied</p>
          <p className='text-muted-foreground mb-4'>
            You do not have permission to view digital resources
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/resources/digital-resources'>
              Return to Digital Resources
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Digital Resources'>
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
              <Link href='/resources/digital-resources'>
                Digital Resource Management
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
            <h1 className='text-2xl font-bold py-1'>Digital Resources</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage your digital licenses, software, and online resources
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            {canCreateResources && (
              <Button className='w-full sm:w-auto' asChild>
                <Link href='/resources/digital-resources/new'>
                  <Plus className='mr-2 h-4 w-4' />
                  Add Digital Resource
                </Link>
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            <DigitalResourceList
              canEdit={canEditResources}
              canDelete={canDeleteResources}
              canReserve={canReserveResources}
            />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
