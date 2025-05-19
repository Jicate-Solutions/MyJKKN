'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { DigitalReservationForm } from '../_components/digital-reservation-form';
import { usePermissions } from '@/hooks/use-permissions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export default function CreateDigitalReservationPage() {
  const router = useRouter();
  const supabase = createClientSupabaseClient();

  // Authentication state
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<Error | null>(null);

  // Permissions state
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions([], { waitForLoad: true });
  const isLoading = authLoading || permissionsLoading;

  // Specific permission checks
  const canCreateReservations =
    isSuperAdmin || canAccess('digital_resources.reservations', 'create');

  // Check authentication
  useEffect(() => {
    const getUser = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          throw error;
        }
        setUser(data.user);
      } catch (error) {
        console.error('Error fetching user:', error);
        setAuthError(
          error instanceof Error
            ? error
            : new Error('Unknown authentication error')
        );
        toast.error('Authentication error. Please login again.');
      } finally {
        setAuthLoading(false);
      }
    };

    getUser();
  }, [supabase.auth]);

  // Debug logging
  useEffect(() => {
    console.log('[CreateDigitalReservationPage] Permission check:', {
      canCreateReservations,
      isLoading,
      authError
    });
  }, [canCreateReservations, isLoading, authError]);

  // Loading state
  if (isLoading) {
    return (
      <ContentLayout title='Create Digital Resource Reservation'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <div className='animate-pulse flex flex-col w-full max-w-3xl gap-4'>
            <div className='h-8 bg-muted rounded w-64'></div>
            <div className='h-4 bg-muted rounded w-full'></div>
            <div className='h-64 bg-muted rounded w-full'></div>
          </div>
        </div>
      </ContentLayout>
    );
  }

  // Authentication error state
  if (authError) {
    return (
      <ContentLayout title='Create Digital Resource Reservation'>
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertTitle>Authentication Error</AlertTitle>
          <AlertDescription>
            There was an error authenticating your account. Please login again.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  // Permission denied state
  if (!canCreateReservations) {
    return (
      <ContentLayout title='Create Digital Resource Reservation'>
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertTitle>Permission Denied</AlertTitle>
          <AlertDescription>
            You do not have permission to create digital resource reservations.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Create Digital Resource Reservation'>
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
              <Link href='/resources/digital-resources/reservations'>
                Reservations
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Create Reservation</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>
            Create Digital Resource Reservation
          </h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Reserve a digital resource for a specific time period
          </p>
        </div>

        <DigitalReservationForm />
      </div>
    </ContentLayout>
  );
}
