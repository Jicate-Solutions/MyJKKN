'use client';

/**
 * Waiting for my approval — every request whose current approval step is mine
 * (HOD, Principal, CAO, Chairperson…), plus the Super Admin's own final approvals.
 * Approvers without other procurement access land here from their notification or
 * from the Overview card.
 */

import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { ContentLayout } from '@/components/layout/content-layout';
import { ResponsiveList } from '@/components/procurement/responsive-list';
import { EmptyState } from '@/components/empty-state';
import { AlertBox } from '@/components/ui/alert-box';
import { useMyApprovals } from '@/hooks/procurement/use-approval-chains';
import { displayRequestNumber } from '@/lib/procurement/display-number';
import { formatDateDMY } from '@/lib/utils/date-format';

export default function MyApprovalsPage() {
  const router = useRouter();
  const { data = [], isLoading, isError } = useMyApprovals();

  return (
    <ContentLayout title="My approvals">
      <div className="w-full space-y-5">
        {/* Not merged into Requests' "Waiting for you": approvers without procurement
            access may open this page (layout gate) but not Requests. */}
        <section className="overflow-hidden rounded-xl border bg-background shadow">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <BeatLoader color="hsl(var(--primary))" size={10} />
              </div>
            ) : isError ? (
              <div className="p-6">
                <AlertBox type="error" message="Failed to load your approvals. Please try again." />
              </div>
            ) : data.length === 0 ? (
              <EmptyState title="Nothing is waiting for you" description="Requests that need your approval appear here." />
            ) : (
              <ResponsiveList
                rows={data}
                getRowKey={(a) => `${a.request_id}:${a.stage}`}
                onRowClick={(a) => router.push(`/procurement/requests/${a.request_id}`)}
                rowLabel={(a) => `Review ${a.title || 'purchase request'} ${displayRequestNumber(a.request_number)}`}
                columns={[
                  {
                    key: 'request',
                    header: 'Request',
                    mobile: 'title',
                    className: 'max-w-[280px] truncate',
                    cell: (a) => <span className="font-medium">{a.title || 'Purchase request'}</span>,
                  },
                  { key: 'no', header: 'Purchase no.', className: 'whitespace-nowrap', cell: (a) => displayRequestNumber(a.request_number) },
                  { key: 'college', header: 'College', className: 'max-w-[200px] truncate', cell: (a) => a.institution_name ?? '—' },
                  { key: 'by', header: 'Raised by', className: 'whitespace-nowrap', cell: (a) => a.requested_by_name ?? '—' },
                  { key: 'category', header: 'Category', className: 'whitespace-nowrap', cell: (a) => a.category_name ?? '—' },
                  {
                    key: 'step',
                    header: 'Your step',
                    mobile: 'badge',
                    className: 'whitespace-nowrap',
                    cell: (a) => (
                      <span className="text-xs font-medium">
                        {a.stage === 'final' ? 'Final approval' : 'Request approval'}
                        {a.step_order <= a.steps_total ? ` · ${a.step_order} of ${a.steps_total}` : ''}
                      </span>
                    ),
                  },
                  { key: 'date', header: 'Submitted', className: 'whitespace-nowrap', cell: (a) => (a.submitted_at ? formatDateDMY(a.submitted_at) : '—') },
                  {
                    key: 'act',
                    header: '',
                    mobile: 'hidden',
                    className: 'text-right',
                    cell: () => (
                      <span className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground">
                        Review
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    ),
                  },
                ]}
              />
            )}
        </section>
      </div>
    </ContentLayout>
  );
}
