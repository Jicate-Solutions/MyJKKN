'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { InstitutionFilter } from '@/components/procurement/institution-filter';
import { StaffOverview, VIEWS } from '@/components/procurement/overview/staff-overview';
import { MyRequests } from '@/components/procurement/overview/my-requests';
import { Segmented } from '@/components/procurement/overview/segmented';
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
 * Staff who also raise requests switch between the two (?as=mine).
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
  const viewParam = searchParams.get('view');
  const view = viewParam === 'updated' || viewParam === 'recent' ? viewParam : 'pending';

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value == null) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `/procurement?${qs}` : '/procurement', { scroll: false });
  };

  return (
    <ContentLayout title="Procurement">
      <div className="w-full space-y-5">
        {myApprovals.length > 0 && (
          <Link
            href="/procurement/approvals"
            className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <span className="flex-1">
              <b>{myApprovals.length}</b> purchase request{myApprovals.length === 1 ? ' is' : 's are'} waiting for your approval
            </span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
        {/* One row: which view · what to count · which college · New request */}
        <header className="flex flex-wrap items-center gap-2">
          {isStaff && canCreateRequest && (
            <Segmented
              label="View"
              size="sm"
              value={showMine ? 'mine' : 'all'}
              onChange={(v) => setParam('as', v === 'mine' ? 'mine' : null)}
              options={[
                { value: 'all', label: 'Overview' },
                { value: 'mine', label: 'My requests' },
              ]}
            />
          )}
          {!showMine && (
            <Segmented
              label="Which purchases to count"
              size="sm"
              value={view}
              onChange={(v) => setParam('view', v === 'pending' ? null : v)}
              options={VIEWS.map((v) => ({ value: v.value, label: v.label }))}
            />
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {!showMine && (
              <InstitutionFilter
                className="w-full sm:w-56 [&_button]:h-10"
                label={null}
                allLabel="All colleges"
                value={college}
                onChange={(id) => setParam('institution', id === 'all' ? null : id)}
              />
            )}
            {canCreateRequest && (
              <Button
                className="h-10"
                onClick={() =>
                  router.push(
                    !showMine && college !== 'all'
                      ? `/procurement/requests/new?institution=${college}`
                      : '/procurement/requests/new'
                  )
                }
              >
                <Plus className="mr-1.5 h-4 w-4" />
                {showMine ? 'Raise a new request' : 'New request'}
              </Button>
            )}
          </div>
        </header>

        {showMine ? <MyRequests /> : <StaffOverview />}
      </div>
    </ContentLayout>
  );
}
