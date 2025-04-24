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
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function EditDigitalReservationPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const unwrappedParams = use(params);
  const id = unwrappedParams.id;

  const [reservation, setReservation] = useState<DigitalReservation | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, [id, router]);

  if (loading) {
    return (
      <ContentLayout title='Loading Reservation...'>
        <div className='flex justify-center items-center py-12'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (!reservation) {
    return (
      <ContentLayout title='Reservation Not Found'>
        <div className='py-12 text-center'>
          <h2 className='text-xl font-semibold'>Reservation not found</h2>
          <p className='mt-2 text-gray-500'>
            The reservation you are looking for doesn&apos;t exist or you don&apos;t have
            permission to edit it.
          </p>
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
