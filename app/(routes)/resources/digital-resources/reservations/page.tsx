'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Suspense } from 'react';
import { DigitalReservationsTableSkeleton } from './_components/digital-reservations-table-skeleton';
import { DigitalReservationsTable } from './_components/digital-reservations-table';
import { usePermissions } from '@/hooks/use-permissions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

export default function DigitalResourceReservationsPage() {
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
  const canViewReservations =
    isSuperAdmin || canAccess('digital_resources.reservations', 'view');
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
    console.log('[DigitalReservationsPage] Permission check:', {
      canViewReservations,
      canCreateReservations,
      isLoading,
      authError
    });
  }, [canViewReservations, canCreateReservations, isLoading, authError]);

  // Loading state
  if (isLoading) {
    return (
      <ContentLayout title='Digital Resource Reservations'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <DigitalReservationsTableSkeleton />
        </div>
      </ContentLayout>
    );
  }

  // Authentication error state
  if (authError) {
    return (
      <ContentLayout title='Digital Resource Reservations'>
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
  if (!canViewReservations) {
    return (
      <ContentLayout title='Digital Resource Reservations'>
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertTitle>Permission Denied</AlertTitle>
          <AlertDescription>
            You do not have permission to view digital resource reservations.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Digital Resource Reservations'>
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
            <BreadcrumbPage>Reservations</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>
              Digital Resource Reservations
            </h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage all digital resource reservations
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            {canCreateReservations && (
              <Button className='w-full sm:w-auto' asChild>
                <Link href='/resources/digital-resources/reservations/new'>
                  <Plus className='mr-2 h-4 w-4' />
                  Create Reservation
                </Link>
              </Button>
            )}
          </div>
        </div>

        <Suspense fallback={<DigitalReservationsTableSkeleton />}>
          <DigitalReservationsTable />
        </Suspense>
      </div>
    </ContentLayout>
  );
}
