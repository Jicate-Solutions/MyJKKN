'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { InstitutionFilter } from '@/components/procurement/institution-filter';
import { StaffOverview } from '@/components/procurement/overview/staff-overview';
import { MyRequests } from '@/components/procurement/overview/my-requests';
import { usePermissions } from '@/hooks/use-permissions';
import { useMyApprovals } from '@/hooks/procurement/use-approval-chains';
import { ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';

/**
 * Procurement Overview — two views of the same purchases:
 *
 *   Staff (Super Admin, approvers, store)  what waits for me, what is held up, where
 *                                          every purchase is, per college
 *   People who raise requests              "My requests": who has each one now, and
 *                                          its steps, items and notes
 *
 * Staff who also raise requests follow their own purchases on the Requests tab
 * (Raised by me); the old ?as=mine link still opens the tracker.
 */
export default function ProcurementHome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canAccess, isSuperAdmin } = usePermissions();
  // Requests whose category approval step is mine right now (HOD, Principal, CAO…).
  const { data: myApprovals = [] } = useMyApprovals();

  const isStaff =
    isSuperAdmin ||
    ['request_approve', 'rfq_manage', 'quotation_manage', 'grn_create', 'grn_verify'].some((p) =>
      canAccess('procurement', p)
    );
  const canCreateRequest = isSuperAdmin || canAccess('procurement', 'request_create');
  const showMine = !isStaff || searchParams.get('as') === 'mine';
  const college = searchParams.get('institution') ?? 'all';

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value == null) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `/procurement?${qs}` : '/procurement', { scroll: false });
  };

  const newRequest = canCreateRequest && (
    <Button
      className="h-9"
      onClick={() =>
        router.push(
          !showMine && college !== 'all'
            ? `/procurement/requests/new?institution=${college}`
            : '/procurement/requests/new'
        )
      }
    >
      <Plus className="mr-1.5 h-4 w-4" />
      New request
    </Button>
  );

  const toolbarRight = (
    <div className="flex flex-wrap items-center gap-2">
      <InstitutionFilter
        className="w-full sm:w-52"
        label={null}
        allLabel="All colleges"
        value={college}
        onChange={(id) => setParam('institution', id === 'all' ? null : id)}
      />
      {canCreateRequest && (
        <Link
          href="/procurement/requests?mine=1"
          className="inline-flex h-9 items-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shadow"
        >
          My requests
        </Link>
      )}
      {newRequest}
    </div>
  );

  return (
    <ContentLayout title="Procurement">
      <div className="w-full space-y-5">
        {/* Staff already see this count as "Waiting for you" in their toolbar; the
            banner is for approvers who only get the My requests view. */}
        {showMine && myApprovals.length > 0 && (
          <Link
            href="/procurement/approvals"
            className="flex items-center gap-3 rounded-xl border bg-background px-4 py-3 text-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shadow"
          >
            <span className="flex-1">
              <b className="text-primary">{myApprovals.length}</b> purchase request{myApprovals.length === 1 ? ' is' : 's are'} waiting for your approval
            </span>
            <span className="text-xs font-medium text-primary">Review</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        )}

        {showMine ? (
          <MyRequests action={newRequest || undefined} />
        ) : (
          <StaffOverview toolbarRight={toolbarRight} />
        )}
      </div>
    </ContentLayout>
  );
}
