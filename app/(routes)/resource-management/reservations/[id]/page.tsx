// app/(routes)/resource-management/reservations/[id]/page.tsx
'use client';

import { ArrowLeft } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { ReservationInfo } from './_components/reservation-info';
import { ReservationActions } from './_components/reservation-actions';
import { ReservationTimeline } from './_components/reservation-timeline';
import { useReservation } from '@/hooks/reservation/use-reservations';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { use } from 'react';

interface ReservationDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default function ReservationDetailsPage({
  params
}: ReservationDetailsPageProps) {
  const router = useRouter();
  const { profile: user } = useAuth();
  const resolvedParams = use(params);
  const reservationId = resolvedParams.id;

  const { data: reservation, isLoading } = useReservation(reservationId);

  if (isLoading) {
    return (
      <ContentLayout title='Loading...'>
        <div className='space-y-6'>
          <Skeleton className='h-8 w-64' />
          <Skeleton className='h-96 w-full' />
          <Skeleton className='h-64 w-full' />
        </div>
      </ContentLayout>
    );
  }

  if (!reservation) {
    return (
      <ContentLayout title='Not Found'>
        <div className='py-12 text-center'>
          <h2 className='text-2xl font-bold mb-2'>Reservation Not Found</h2>
          <p className='text-muted-foreground mb-4'>
            The reservation you&apos;re looking for doesn&apos;t exist or has
            been deleted.
          </p>
          <Button
            onClick={() =>
              router.push('/resource-management/reservations/my-reservations')
            }
          >
            <ArrowLeft className='mr-2 h-4 w-4' />
            Back to My Reservations
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Reservation Details'>
      <Breadcrumb className='mb-6'>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href='/resource-management'>
              Resource Management
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href='/resource-management/reservations'>
              Reservations
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href='/resource-management/reservations/my-reservations'>
              My Reservations
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Details</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Back Button */}
      <div className='mb-6'>
        <Button
          variant='outline'
          onClick={() =>
            router.push('/resource-management/reservations/my-reservations')
          }
        >
          <ArrowLeft className='mr-2 h-4 w-4' />
          Back to My Reservations
        </Button>
      </div>

      {/* Content Grid */}
      <div className='grid gap-6 lg:grid-cols-3'>
        {/* Main Content */}
        <div className='lg:col-span-2 space-y-6'>
          <ReservationInfo reservation={reservation} />
        </div>

        {/* Sidebar */}
        <div className='space-y-6'>
          <ReservationActions reservation={reservation} userId={user?.id} />
          <ReservationTimeline reservation={reservation} />
        </div>
      </div>
    </ContentLayout>
  );
}
