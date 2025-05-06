'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Loader2, AlertTriangle } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { DigitalResourceForm } from '../_components/digital-resource-form';
import { DigitalResourceService } from '@/lib/services/resource/digital/digital-resource-service';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';

export default function CreateDigitalResourcePage() {
  const router = useRouter();

  // Authentication state
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Permissions state
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions([], { waitForLoad: true });
  const isLoading = authLoading || permissionsLoading;

  // Specific permission check
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
            'Create Digital Resource: Auth session found:',
            sessionData.session.user.id
          );
          setUser(sessionData.session.user);
        } else {
          console.log(
            'Create Digital Resource: No session found, trying to get user'
          );
          const { data } = await supabase.auth.getUser();
          if (data?.user) {
            console.log('Create Digital Resource: User found:', data.user.id);
            setUser(data.user);
          } else {
            console.log('Create Digital Resource: No authenticated user found');
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Create Digital Resource: Auth check error:', error);
        setUser(null);
        setAuthError('Authentication error. Please try again.');
      } finally {
        setAuthLoading(false);
      }
    };

    // Check auth immediately
    checkAuth();

    // Setup auth state change listener
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('Create Digital Resource: Auth state changed:', event);
        if (session) {
          console.log(
            'Create Digital Resource: New session user:',
            session.user.id
          );
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
      console.log('Create Digital Resource permissions debug:', {
        isSuperAdmin,
        canCreateResources: canAccess('digital_resources', 'create')
      });
    }
  }, [permissionsLoading, isSuperAdmin, canAccess]);

  // Redirect if not allowed to create resources
  useEffect(() => {
    if (!isLoading && (!user || !canCreateResources)) {
      if (!user) {
        toast.error('You must be logged in to create digital resources');
        router.push('/login');
      } else if (!canCreateResources) {
        toast.error('You do not have permission to create digital resources');
        router.push('/resources/digital-resources');
      }
    }
  }, [user, isLoading, canCreateResources, router]);

  const handleSubmit = async (data: any) => {
    try {
      await DigitalResourceService.createDigitalResource(data);
      toast.success('Digital resource created successfully');
      router.push('/resources/digital-resources');
    } catch (error) {
      console.error('Error creating digital resource:', error);
      toast.error('Failed to create digital resource');
      throw error;
    }
  };

  const handleCancel = () => {
    router.push('/resources/digital-resources');
  };

  if (isLoading) {
    return (
      <ContentLayout title='Create Digital Resource'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
          <span className='ml-2'>Loading...</span>
        </div>
      </ContentLayout>
    );
  }

  if (authError) {
    return (
      <ContentLayout title='Create Digital Resource'>
        <div className='text-center py-8'>
          <AlertTriangle className='h-12 w-12 text-amber-500 mx-auto mb-4' />
          <p className='text-destructive text-xl font-medium'>Error</p>
          <p className='text-muted-foreground mb-4'>{authError}</p>
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
      <ContentLayout title='Create Digital Resource'>
        <div className='text-center py-8'>
          <AlertTriangle className='h-12 w-12 text-amber-500 mx-auto mb-4' />
          <p className='text-destructive text-xl font-medium'>
            Authentication Required
          </p>
          <p className='text-muted-foreground mb-4'>
            You must be logged in to create digital resources
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/login'>Go to Login</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!canCreateResources) {
    return (
      <ContentLayout title='Create Digital Resource'>
        <div className='text-center py-8'>
          <AlertTriangle className='h-12 w-12 text-amber-500 mx-auto mb-4' />
          <p className='text-destructive text-xl font-medium'>Access Denied</p>
          <p className='text-muted-foreground mb-4'>
            You do not have permission to create digital resources
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
    <ContentLayout title='Create Digital Resource'>
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
            <BreadcrumbPage>Create</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex items-center space-x-2'>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => router.push('/resources/digital-resources')}
            className='flex items-center'
          >
            <ChevronLeft className='h-4 w-4 mr-1' />
            Back to Digital Resources
          </Button>
        </div>

        <div>
          <h1 className='text-2xl font-bold py-1'>Create Digital Resource</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Add a new digital resource to the system
          </p>
        </div>

        <DigitalResourceForm onSubmit={handleSubmit} onCancel={handleCancel} />
      </div>
    </ContentLayout>
  );
}
