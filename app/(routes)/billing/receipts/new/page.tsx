'use client';

import { useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePermissions } from '@/hooks/use-permissions';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { BeatLoader } from 'react-spinners';
import { ReceiptEntryForm } from '../_components/receipt-entry-form';

/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/billing/receipts',
} as const;

/**
 * Standalone Generate Receipt page.
 *
 * The form itself lives in ../_components/receipt-entry-form so that the
 * in-place popup on /billing/schedule/students runs byte-identical allocation
 * and validation logic. This page is the deep-link / bookmark entry point and
 * the destination for callers that genuinely want a full-page flow
 * (/billing/transport, /billing/student-bills/[billId]).
 */
export default function NewReceiptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const billId = searchParams.get('bill_id');
  const billIdsParam = searchParams.get('bill_ids'); // For bulk receipt generation
  const studentId = searchParams.get('student_id');
  // Where to go after the receipt is saved. Callers that are not the global
  // receipts list (e.g. /billing/transport) pass this so the operator lands
  // back where they started — the default target, the learner's billing
  // schedule page, needs learner + schedule read permissions that a
  // collection-only role (transport_head) does not have.
  const returnTo = searchParams.get('returnTo');

  const billIds = useMemo(() => {
    if (billIdsParam) return billIdsParam.split(',').filter(Boolean);
    return billId ? [billId] : [];
  }, [billIdsParam, billId]);

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canCreateReceipts =
    isSuperAdmin || canAccess('billing.receipts', 'create');

  useEffect(() => {
    // Redirect to student search if no bill parameters provided
    if (!billId && !billIdsParam && !studentId) {
      router.push('/billing/schedule/students?action=generate_receipt');
    }
  }, [billId, billIdsParam, studentId, router]);

  if (permissionsLoading) {
    return (
      <ContentLayout title='Generate Receipt'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canCreateReceipts) {
    return (
      <ContentLayout title='Generate Receipt'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to create receipts.
          </p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Generate Receipt'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Receipts', href: '/billing/receipts' },
          { label: 'Generate Receipt', href: '/billing/receipts/new' }
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div className='flex items-center gap-4'>
            <Button variant='outline' size='sm' onClick={() => router.back()}>
              <ArrowLeft className='mr-2 h-4 w-4' />
              Back
            </Button>
            <div>
              <h1 className='text-2xl font-bold py-1'>Generate Receipt</h1>
              <p className='text-sm sm:text-base text-muted-foreground'>
                Create a new payment receipt for student billing
              </p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Receipt Information</CardTitle>
          </CardHeader>
          <CardContent>
            <ReceiptEntryForm
              billIds={billIds}
              studentId={studentId}
              onCancel={() => router.back()}
              onSuccess={({ studentId: settledStudentId }) => {
                // 2026-05-21: redirect back to the student's billing schedule
                // page (Receipts tab) instead of the global receipts list.
                // Receipts are always created in the context of a single
                // learner — the schedule page lets the operator see the new
                // receipt next to the bill it settled, plus any remaining
                // outstanding bills, in one view.
                // A caller-supplied returnTo wins: the schedule page needs
                // learner and schedule read permissions, so collection-only
                // roles arriving from /billing/transport must go back there.
                router.push(
                  returnTo ||
                    `/billing/schedule/students/${settledStudentId}?tab=receipts`
                );
              }}
            />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
