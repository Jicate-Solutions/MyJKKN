'use client';

// Warden / hostel office raises a vacate request on behalf of a resident.
// Reached from the allocation detail page with ?allocation=<hostel_allocations.id>.

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VacateRequestForm } from '../_components/vacate-request-form';

export const navMeta = {
  invokedFrom: '/campus-living/allocations',
} as const;

function RaiseOnBehalf() {
  const allocationId = useSearchParams().get('allocation') ?? '';

  if (!allocationId) {
    return (
      <ContentLayout title='Raise Vacate Request'>
        <Card>
          <CardContent className='p-8 text-center space-y-3'>
            <p>Open a resident&apos;s allocation and choose “Raise vacate request”.</p>
            <Button asChild variant='outline'>
              <Link href='/campus-living/allocations'>Go to Allocations</Link>
            </Button>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <VacateRequestForm
      allocationId={allocationId}
      backHref='/campus-living/vacate-requests'
      backLabel='Vacate Requests'
    />
  );
}

export default function RaiseVacateOnBehalfPage() {
  return (
    <Suspense
      fallback={
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin text-primary' />
        </div>
      }
    >
      <RaiseOnBehalf />
    </Suspense>
  );
}
