'use client';

// app/(routes)/resource-management/reservations/[id]/page.tsx

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
import {
  useReservation,
  useReservationApprovals
} from '@/hooks/reservation/use-reservations';
import { useAuth } from '@/hooks/use-auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { use } from 'react';

interface ReservationDetailsPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Where the back button / breadcrumb should point. A detail page opened from
 * the Approvals queue has to return to Approvals — sending the approver to
 * My Reservations loses their place in the queue mid-review.
 *
 * Resolved against a fixed allowlist rather than pushing the raw ?returnTo=
 * value: an unvalidated value out of the URL would make this an open
 * redirect, and the allowlist supplies the label for free.
 */
const RETURN_TARGETS = [
  { path: '/resource-management/reservations/approvals', label: 'Approvals' },
  { path: '/resource-management/reservations', label: 'Reservations' },
  {
    path: '/resource-management/reservations/my-reservations',
    label: 'My Reservations'
  }
] as const;

/** Unchanged default, so callers that omit ?returnTo= behave exactly as before. */
const DEFAULT_RETURN_TARGET = RETURN_TARGETS[2];

function resolveReturnTarget(returnTo: string | null) {
  return (
    RETURN_TARGETS.find((t) => t.path === returnTo) ?? DEFAULT_RETURN_TARGET
  );
}

export default function ReservationDetailsPage({
  params
}: ReservationDetailsPageProps) {
  // `use()` on a pending promise SUSPENDS. It must come before every other
  // hook: suspending part-way down the hook list makes React replay the
  // component, and the replay can produce a different hook sequence than the
  // discarded attempt ("change in the order of Hooks called by
  // ReservationDetailsPage"). Unwrapping params first means nothing can
  // suspend mid-list.
  const resolvedParams = use(params);
  const reservationId = resolvedParams.id;

  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile: user } = useAuth();

  const backTarget = resolveReturnTarget(searchParams.get('returnTo'));

  const { data: reservation, isLoading } = useReservation(reservationId);
  const { data: approvals, isLoading: isLoadingApprovals } =
    useReservationApprovals(reservationId);

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
          <Button onClick={() => router.push(backTarget.path)}>
            <ArrowLeft className='mr-2 h-4 w-4' />
            Back to {backTarget.label}
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
            <BreadcrumbLink href={backTarget.path}>
              {backTarget.label}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Details</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Back Button */}
      <div className='mb-6'>
        <Button variant='outline' onClick={() => router.push(backTarget.path)}>
          <ArrowLeft className='mr-2 h-4 w-4' />
          Back to {backTarget.label}
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
          <ReservationTimeline
            reservation={reservation}
            approvals={approvals || []}
            isLoadingApprovals={isLoadingApprovals}
          />
        </div>
      </div>
    </ContentLayout>
  );
}
