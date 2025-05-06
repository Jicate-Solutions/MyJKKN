'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { DigitalResourceForm } from '../../_components/digital-resource-form';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Loader2, AlertTriangle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { DigitalResourceService } from '@/lib/services/resource/digital/digital-resource-service';
import { DigitalResource } from '@/types/digital-resources';
import { toast } from 'react-hot-toast';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';

export default function EditDigitalResourcePage() {
  const params = useParams();
  const router = useRouter();
  const [resource, setResource] = useState<DigitalResource | null>(null);
  const [resourceLoading, setResourceLoading] = useState(true);
  const [resourceError, setResourceError] = useState<string | null>(null);

  const id = params.id as string;

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
  const canEditResources =
    isSuperAdmin || canAccess('digital_resources', 'edit');

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
            'Edit Digital Resource: Auth session found:',
            sessionData.session.user.id
          );
          setUser(sessionData.session.user);
        } else {
          console.log(
            'Edit Digital Resource: No session found, trying to get user'
          );
          const { data } = await supabase.auth.getUser();
          if (data?.user) {
            console.log('Edit Digital Resource: User found:', data.user.id);
            setUser(data.user);
          } else {
            console.log('Edit Digital Resource: No authenticated user found');
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Edit Digital Resource: Auth check error:', error);
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
        console.log('Edit Digital Resource: Auth state changed:', event);
        if (session) {
          console.log(
            'Edit Digital Resource: New session user:',
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
      console.log('Edit Digital Resource permissions debug:', {
        isSuperAdmin,
        canEditResources: canAccess('digital_resources', 'edit')
      });
    }
  }, [permissionsLoading, isSuperAdmin, canAccess]);

  // Redirect if not allowed to edit resources
  useEffect(() => {
    if (!isLoading && (!user || !canEditResources)) {
      if (!user) {
        toast.error('You must be logged in to edit digital resources');
        router.push('/login');
      } else if (!canEditResources) {
        toast.error('You do not have permission to edit digital resources');
        router.push('/resources/digital-resources');
      }
    }
  }, [user, isLoading, canEditResources, router]);

  useEffect(() => {
    const fetchResource = async () => {
      if (!user || !canEditResources) return;

      try {
        setResourceLoading(true);
        const data = await DigitalResourceService.getDigitalResource(id);
        setResource(data);
      } catch (error) {
        console.error('Error fetching digital resource:', error);
        setResourceError('Failed to load digital resource details');
        toast.error('Failed to load digital resource details');
      } finally {
        setResourceLoading(false);
      }
    };

    if (id && !isLoading && user && canEditResources) {
      fetchResource();
    }
  }, [id, user, isLoading, canEditResources]);

  const handleSubmit = async (data: any) => {
    try {
      await DigitalResourceService.updateDigitalResource(id, data);
      toast.success('Digital resource updated successfully');
      router.push(`/resources/digital-resources/${id}`);
    } catch (error) {
      console.error('Error updating digital resource:', error);
      toast.error('Failed to update digital resource');
      throw error;
    }
  };

  const handleCancel = () => {
    router.push(`/resources/digital-resources/${id}`);
  };

  // First check authentication and permissions
  if (isLoading) {
    return (
      <ContentLayout title='Edit Digital Resource'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
          <span className='ml-2'>Loading...</span>
        </div>
      </ContentLayout>
    );
  }

  if (authError) {
    return (
      <ContentLayout title='Edit Digital Resource'>
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
      <ContentLayout title='Edit Digital Resource'>
        <div className='text-center py-8'>
          <AlertTriangle className='h-12 w-12 text-amber-500 mx-auto mb-4' />
          <p className='text-destructive text-xl font-medium'>
            Authentication Required
          </p>
          <p className='text-muted-foreground mb-4'>
            You must be logged in to edit digital resources
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/login'>Go to Login</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!canEditResources) {
    return (
      <ContentLayout title='Edit Digital Resource'>
        <div className='text-center py-8'>
          <AlertTriangle className='h-12 w-12 text-amber-500 mx-auto mb-4' />
          <p className='text-destructive text-xl font-medium'>Access Denied</p>
          <p className='text-muted-foreground mb-4'>
            You do not have permission to edit digital resources
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

  // Then check resource loading states
  if (resourceLoading) {
    return (
      <ContentLayout title='Edit Digital Resource'>
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
                  Digital Resources
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Edit</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className='flex justify-center items-center h-64 mt-4'>
          <Loader2 className='h-8 w-8 animate-spin text-primary' />
        </div>
      </ContentLayout>
    );
  }

  if (resourceError) {
    return (
      <ContentLayout title='Error Loading Resource'>
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
                  Digital Resources
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Error</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className='text-center py-8'>
          <AlertTriangle className='h-12 w-12 text-amber-500 mx-auto mb-4' />
          <p className='text-destructive text-xl font-medium'>
            Error Loading Resource
          </p>
          <p className='text-muted-foreground mb-4'>{resourceError}</p>
          <Button
            variant='outline'
            onClick={() => router.push('/resources/digital-resources')}
            className='mt-4'
          >
            Return to Digital Resources
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!resource) {
    return (
      <ContentLayout title='Resource Not Found'>
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
                  Digital Resources
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Not Found</BreadcrumbPage>
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

          <div className='text-center py-8 text-destructive'>
            Digital resource not found or has been deleted.
          </div>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Edit ${resource.digital_resource_name}`}>
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
            <BreadcrumbLink asChild>
              <Link href={`/resources/digital-resources/${id}`}>
                {resource.digital_resource_name}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex items-center space-x-2'>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => router.push(`/resources/digital-resources/${id}`)}
            className='flex items-center'
          >
            <ChevronLeft className='h-4 w-4 mr-1' />
            Back to Resource Details
          </Button>
        </div>

        <div>
          <h1 className='text-2xl font-bold py-1'>Edit Digital Resource</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Update the details of {resource.digital_resource_name}
          </p>
        </div>

        <DigitalResourceForm
          initialData={resource}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      </div>
    </ContentLayout>
  );
}
