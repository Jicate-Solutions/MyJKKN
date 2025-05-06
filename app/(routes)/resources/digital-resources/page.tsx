'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import {
  Plus,
  List,
  BarChart,
  Share2,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';

export default function DigitalResourcesPage() {
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
  const isLoading = authLoading || permissionsLoading;

  // Specific permission checks
  const canViewDashboard =
    isSuperAdmin || canAccess('digital_resources.dashboard', 'view');
  const canViewResources =
    isSuperAdmin || canAccess('digital_resources.view', 'view');
  const canCreateResources =
    isSuperAdmin || canAccess('digital_resources.create', 'create');
  const canViewPolicies =
    isSuperAdmin || canAccess('digital_resources.policies', 'view');
  const canViewReservations =
    isSuperAdmin || canAccess('digital_resources.reservations', 'view');

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
            'Digital Resources: Auth session found:',
            sessionData.session.user.id
          );
          setUser(sessionData.session.user);
        } else {
          console.log(
            'Digital Resources: No session found, trying to get user'
          );
          const { data } = await supabase.auth.getUser();
          if (data?.user) {
            console.log('Digital Resources: User found:', data.user.id);
            setUser(data.user);
          } else {
            console.log('Digital Resources: No authenticated user found');
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Digital Resources: Auth check error:', error);
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    // Check auth immediately
    checkAuth();

    // Setup auth state change listener
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('Digital Resources: Auth state changed:', event);
        if (session) {
          console.log('Digital Resources: New session user:', session.user.id);
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
      console.log('Digital resources permissions debug:', {
        isSuperAdmin,
        canViewDashboard: canAccess('digital_resources.dashboard', 'view'),
        canViewResources: canAccess('digital_resources', 'view'),
        canCreateResources: canAccess('digital_resources', 'create'),
        canViewPolicies: canAccess('digital_resources.policies', 'view'),
        canViewReservations: canAccess('digital_resources.reservations', 'view')
      });
    }
  }, [permissionsLoading, isSuperAdmin, canAccess]);

  // Redirect if not allowed to view resources
  useEffect(() => {
    if (!isLoading && (!user || (!canViewResources && !isSuperAdmin))) {
      if (!user) {
        toast.error('You must be logged in to access digital resources');
        router.push('/login');
      } else if (!canViewResources && !isSuperAdmin) {
        toast.error('You do not have permission to view digital resources');
        router.push('/dashboard');
      }
    }
  }, [user, isLoading, canViewResources, isSuperAdmin, router]);

  // If loading, show loading state
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

  // If not authenticated or no permission, show error state
  if (!user) {
    return (
      <ContentLayout title='Digital Resources'>
        <div className='text-center py-8'>
          <AlertTriangle className='h-12 w-12 text-amber-500 mx-auto mb-4' />
          <p className='text-destructive text-xl font-medium'>
            Authentication Required
          </p>
          <p className='text-muted-foreground mb-4'>
            You must be logged in to access digital resources
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/login'>Go to Login</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!canViewResources && !isSuperAdmin) {
    return (
      <ContentLayout title='Digital Resources'>
        <div className='text-center py-8'>
          <AlertTriangle className='h-12 w-12 text-amber-500 mx-auto mb-4' />
          <p className='text-destructive text-xl font-medium'>Access Denied</p>
          <p className='text-muted-foreground mb-4'>
            You do not have permission to view digital resources
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/dashboard'>Return to Dashboard</Link>
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
            <BreadcrumbPage>Digital Resources</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Digital Resources</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage your digital resources, licenses, and reservations
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            {canViewDashboard && (
              <Button className='w-full sm:w-auto' variant='outline' asChild>
                <Link href='/resources/digital-resources/dashboard'>
                  <BarChart className='mr-2 h-4 w-4' />
                  View Dashboard
                </Link>
              </Button>
            )}

            {canViewResources && (
              <Button className='w-full sm:w-auto' variant='outline' asChild>
                <Link href='/resources/digital-resources/resources'>
                  <List className='mr-2 h-4 w-4' />
                  View Resources
                </Link>
              </Button>
            )}

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

        <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
          {canViewResources && (
            <Card>
              <CardHeader>
                <CardTitle>Resources</CardTitle>
                <CardDescription>Digital resources catalog</CardDescription>
              </CardHeader>
              <CardContent>
                <p className='mb-4'>
                  View, add, edit, and manage your digital resources.
                </p>
                <Button className='w-full' asChild>
                  <Link href='/resources/digital-resources/resources'>
                    <List className='mr-2 h-4 w-4' />
                    Manage Resources
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {canViewReservations && (
            <Card>
              <CardHeader>
                <CardTitle>Reservations</CardTitle>
                <CardDescription>Resource reservations</CardDescription>
              </CardHeader>
              <CardContent>
                <p className='mb-4'>
                  View, create, and manage digital resource reservations.
                </p>
                <Button className='w-full' asChild>
                  <Link href='/resources/digital-resources/reservations'>
                    <List className='mr-2 h-4 w-4' />
                    Manage Reservations
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {canViewPolicies && (
            <Card>
              <CardHeader>
                <CardTitle>Sharing Policies</CardTitle>
                <CardDescription>Access control policies</CardDescription>
              </CardHeader>
              <CardContent>
                <p className='mb-4'>
                  Define how digital resources can be shared and accessed.
                </p>
                <Button className='w-full' asChild>
                  <Link href='/resources/digital-resources/policies'>
                    <Share2 className='mr-2 h-4 w-4' />
                    Manage Policies
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {canViewDashboard && (
            <Card>
              <CardHeader>
                <CardTitle>Dashboard</CardTitle>
                <CardDescription>Analytics and metrics</CardDescription>
              </CardHeader>
              <CardContent>
                <p className='mb-4'>
                  View usage statistics and analytics for your digital
                  resources.
                </p>
                <Button className='w-full' asChild>
                  <Link href='/resources/digital-resources/dashboard'>
                    <BarChart className='mr-2 h-4 w-4' />
                    View Dashboard
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </ContentLayout>
  );
}
