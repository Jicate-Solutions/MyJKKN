'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { DigitalReservationForm } from '../../_components/digital-reservation-form';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { DigitalReservation } from '@/types/digital-resources';
import { use } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export default function EditDigitalReservationPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const unwrappedParams = use(params);
  const id = unwrappedParams.id;
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

  // Specific permission checks
  const canEditReservations =
    isSuperAdmin || canAccess('digital_resources.reservations', 'edit');

  const [reservation, setReservation] = useState<DigitalReservation | null>(
    null
  );
  const [loading, setLoading] = useState(true);

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

  // Debug logging for permissions
  useEffect(() => {
    console.log('[EditDigitalReservationPage] Permission check:', {
      canEditReservations,
      isLoading: authLoading || permissionsLoading,
      authError
    });
  }, [canEditReservations, authLoading, permissionsLoading, authError]);

  useEffect(() => {
    // Only fetch reservation if user has permission to edit
    if (!authLoading && !permissionsLoading && canEditReservations) {
      const fetchReservation = async () => {
        setLoading(true);
        try {
          const supabase = createClientSupabaseClient();
          const { data, error } = await supabase
            .from('digital_reservations')
            .select('*')
            .eq('id', id)
            .single();

          if (error) {
            throw error;
          }

          setReservation(data as DigitalReservation);
        } catch (error) {
          console.error('Error fetching reservation:', error);
          toast.error('Failed to load reservation details');
          router.push('/resources/digital-resources/reservations');
        } finally {
          setLoading(false);
        }
      };

      fetchReservation();
    }
  }, [id, router, authLoading, permissionsLoading, canEditReservations]);

  // Loading state
  if (authLoading || permissionsLoading || (canEditReservations && loading)) {
    return (
      <ContentLayout title='Edit Reservation'>
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
      <ContentLayout title='Edit Reservation'>
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
  if (!canEditReservations) {
    return (
      <ContentLayout title='Edit Reservation'>
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertTitle>Permission Denied</AlertTitle>
          <AlertDescription>
            You do not have permission to edit digital resource reservations.
          </AlertDescription>
        </Alert>
        <div className='mt-4 flex justify-center'>
          <Button
            variant='outline'
            onClick={() =>
              router.push('/resources/digital-resources/reservations')
            }
          >
            Back to Reservations
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!reservation) {
    return (
      <ContentLayout title='Reservation Not Found'>
        <div className='py-12 text-center'>
          <h2 className='text-xl font-semibold'>Reservation not found</h2>
          <p className='mt-2 text-muted-foreground'>
            The reservation you are looking for doesn&apos;t exist or has been
            deleted.
          </p>
          <Button
            variant='outline'
            className='mt-4'
            onClick={() =>
              router.push('/resources/digital-resources/reservations')
            }
          >
            Back to Reservations
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Edit Reservation: ${reservation.title}`}>
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
            <BreadcrumbPage>Edit Reservation</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>
            Edit Digital Resource Reservation
          </h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Update the details for this reservation
          </p>
        </div>

        <DigitalReservationForm reservation={reservation} />
      </div>
    </ContentLayout>
  );
}
