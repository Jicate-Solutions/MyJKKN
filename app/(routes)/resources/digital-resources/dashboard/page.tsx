'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Plus, List, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { DigitalResourceDashboard } from '../_components/digital-resource-dashboard';
import { Suspense } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';

export default function DigitalResourcesDashboardPage() {
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
    isSuperAdmin || canAccess('digital_resources', 'view');
  const canCreateResources =
    isSuperAdmin || canAccess('digital_resources', 'create');

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
            'Dashboard: Auth session found:',
            sessionData.session.user.id
          );
          setUser(sessionData.session.user);
        } else {
          console.log('Dashboard: No session found, trying to get user');
          const { data } = await supabase.auth.getUser();
          if (data?.user) {
            console.log('Dashboard: User found:', data.user.id);
            setUser(data.user);
          } else {
            console.log('Dashboard: No authenticated user found');
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Dashboard: Auth check error:', error);
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
        console.log('Dashboard: Auth state changed:', event);
        if (session) {
          console.log('Dashboard: New session user:', session.user.id);
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
      console.log('Dashboard permissions debug:', {
        isSuperAdmin,
        canViewDashboard: canAccess('digital_resources.dashboard', 'view'),
        canViewResources: canAccess('digital_resources', 'view'),
        canCreateResources: canAccess('digital_resources', 'create')
      });
    }
  }, [permissionsLoading, isSuperAdmin, canAccess]);

  // Redirect if not allowed to view dashboard
  useEffect(() => {
    if (!isLoading && (!user || !canViewDashboard)) {
      if (!user) {
        toast.error('You must be logged in to access the dashboard');
        router.push('/login');
      } else if (!canViewDashboard) {
        toast.error('You do not have permission to view the dashboard');
        router.push('/resources/digital-resources');
      }
    }
  }, [user, isLoading, canViewDashboard, router]);

  // If loading, show loading state
  if (isLoading) {
    return (
      <ContentLayout title='Digital Resources Dashboard'>
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
      <ContentLayout title='Digital Resources Dashboard'>
        <div className='text-center py-8'>
          <AlertTriangle className='h-12 w-12 text-amber-500 mx-auto mb-4' />
          <p className='text-destructive text-xl font-medium'>
            Authentication Required
          </p>
          <p className='text-muted-foreground mb-4'>
            You must be logged in to access the dashboard
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/login'>Go to Login</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!canViewDashboard) {
    return (
      <ContentLayout title='Digital Resources Dashboard'>
        <div className='text-center py-8'>
          <AlertTriangle className='h-12 w-12 text-amber-500 mx-auto mb-4' />
          <p className='text-destructive text-xl font-medium'>Access Denied</p>
          <p className='text-muted-foreground mb-4'>
            You do not have permission to view the dashboard
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
    <ContentLayout title='Digital Resources Dashboard'>
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
              <Link href='/resources/digital-resources'>Digital Resources</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Dashboard</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>
              Digital Resources Dashboard
            </h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Overview of your digital resources, licenses, and reservations
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
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

        <Suspense fallback={<div>Loading dashboard...</div>}>
          <DigitalResourceDashboard />
        </Suspense>
      </div>
    </ContentLayout>
  );
}
