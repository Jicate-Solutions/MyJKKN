'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { usePurchaseRequests } from '@/hooks/procurement/use-purchase-requests';
import { useDebounceValue } from '@/hooks/use-debounce-value';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { InstitutionFilter } from '@/components/procurement/institution-filter';
import { StatusBadge } from '@/components/procurement/status-badge';
import { EmptyState } from '@/components/empty-state';
import { AlertBox } from '@/components/ui/alert-box';
import { formatDateDMY } from '@/lib/utils/date-format';
import { displayRequestNumber } from '@/lib/procurement/display-number';
import { STAGE_CONFIG, STAGE_FILTERS, stageOf } from '@/lib/procurement/purchase-stage';
import { type ProcurementPurchaseRequest, type PurchaseRequestFilters } from '@/types/procurement';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronRight, Plus, Search } from 'lucide-react';
import { useMyApprovals } from '@/hooks/procurement/use-approval-chains';
import { ResponsiveList } from '@/components/procurement/responsive-list';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BeatLoader } from 'react-spinners';

/** "Keyboard × 5" · "Keyboard × 5, Mouse × 2" · "Keyboard × 5 + 3 more" */
function whatIsNeeded(req: ProcurementPurchaseRequest): string {
  const items = req.item_preview ?? [];
  if (!items.length) return `${req.item_count ?? 0} item${req.item_count === 1 ? '' : 's'}`;
  const fmt = (i: { item_name: string; required_quantity: number }) => `${i.item_name} × ${Number(i.required_quantity)}`;
  if (items.length <= 2) return items.map(fmt).join(', ');
  return `${fmt(items[0])} + ${items.length - 1} more`;
}

const WAITING_ON: Record<string, string> = {
  submitted: 'item approvers',
  getting_quotes: 'the store team',
  with_super_admin: 'Super Admin',
  ordered: 'delivery',
  returned: 'the requester',
};

// Older links (Overview bars, bookmarks) still say ?status=<request status>.
const LEGACY_STATUS_TO_STAGE: Record<string, string> = { approved: 'getting_quotes', converted: 'getting_quotes' };

/**
 * Requests — the one list. Every purchase from "asked for" to "received", with its
 * stage in plain words; a row opens the purchase page where all the work happens.
 */
export default function PurchasesPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canCreate = isSuperAdmin || canAccess('procurement', 'request_create');

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounceValue(search, 300);
  const searchParams = useSearchParams();
  const [view, setView] = useState<'list' | 'table'>('table');
  // The Status dropdown's first choice is "Waiting for you" (not a stage — worked
  // out below from My approvals), and the page opens on it. The Overview status
  // bars link here with ?institution=<id|all>&status=<status>, which opens on that
  // stage instead.
  const [stageFilter, setStageFilter] = useState<string>(() => {
    const raw = searchParams.get('stage') ?? searchParams.get('status');
    return raw ? LEGACY_STATUS_TO_STAGE[raw] ?? raw : 'waiting';
  });
  const waitingForMe = stageFilter === 'waiting';
  // Opens on every college the viewer may see (RLS scopes the rows): requesters
  // usually raise purchases for a college other than their profile's, and a list
  // pinned to the profile college hid their own requests from them.
  const [institutionId, setInstitutionId] = useState<string | undefined>(
    () => searchParams.get('institution') ?? 'all'
  );
  // People who only raise requests open on their own requests, so they can follow
  // what happened to each one; approvers and buyers open on everything. Ticking the
  // box (or ?mine=1 / ?mine=0) overrides the default.
  const [mineChoice, setMineOnly] = useState<boolean | null>(() => {
    const m = searchParams.get('mine');
    return m === '1' ? true : m === '0' ? false : null;
  });
  const handlesOthers =
    isSuperAdmin ||
    canAccess('procurement', 'request_approve') ||
    canAccess('procurement', 'quotation_manage') ||
    canAccess('procurement', 'rfq_manage');
  const mineOnly = mineChoice ?? !handlesOthers;
  // 'all' = every college the viewer may see (RLS scopes the rows). effectiveInstitution
  // stays a concrete college for anything that creates a document.
  const allColleges = institutionId === 'all';
  const effectiveInstitution =
    (institutionId && !allColleges ? institutionId : undefined) ?? profile?.institution_id ?? undefined;

  const filters: PurchaseRequestFilters = {
    search: debouncedSearch || undefined,
    stage: stageFilter !== 'all' && !waitingForMe ? stageFilter : undefined,
    institution_id: allColleges ? undefined : effectiveInstitution,
    all_institutions: allColleges,
    requested_by: mineOnly ? profile?.id : undefined,
    // "Waiting for you" is worked out here, so load enough rows for the counts to be true.
    limit: 200,
  };

  const { data: response, isLoading, isError } = usePurchaseRequests(filters);
  // Request numbers restart per college, so "All colleges" also names the college.
  // (No FK from requests to institutions, so the names come from the access list.)
  const { institutions } = useUserInstitutionAccess();
  const collegeName = (id: string) => institutions.find((i) => i.institution_id === id)?.institution_name ?? null;
  // "Ordered" and "Received" share a quotation status; the orders tell them apart.
  const requests = (response?.data ?? []).filter(
    (r) => (stageFilter !== 'ordered' && stageFilter !== 'received') || stageOf(r) === stageFilter
  );

  // "Waiting for you" = purchase approvals where it is this viewer's turn: their request-approval
  // or final-approval step (plus the Super Admin's own final approvals). Same source as My approvals.
  const { data: myApprovals = [] } = useMyApprovals();
  const approvalIds = new Set(myApprovals.map((a) => a.request_id));
  const yourTurn = (req: ProcurementPurchaseRequest) => approvalIds.has(req.id);

  // With a stage picked the rows are only that stage, so fall back to every
  // request waiting on this viewer (My approvals) for the dropdown's count.
  const waitingCount =
    waitingForMe || stageFilter === 'all' ? requests.filter(yourTurn).length : approvalIds.size;
  const shown = (waitingForMe ? requests.filter(yourTurn) : requests)
    .slice()
    .sort((x, y) => Number(yourTurn(y)) - Number(yourTurn(x)));

  return (
    <ContentLayout title="Requests">
      <div className="w-full space-y-5">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search item, purchase no. or title"
              aria-label="Search purchases"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9"
            />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="h-9 w-full sm:w-48" aria-label="Status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="waiting">Waiting for you ({waitingCount})</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
              {STAGE_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm shadow">
            <Checkbox checked={mineOnly} onCheckedChange={(v) => setMineOnly(v === true)} />
            Raised by me
          </label>
          <InstitutionFilter
            value={allColleges ? 'all' : effectiveInstitution}
            onChange={setInstitutionId}
            allLabel="All colleges"
            label={null}
            className="w-full sm:w-52 [&_button]:h-9"
          />
          <div role="group" aria-label="Layout" className="inline-flex gap-0.5 rounded-lg bg-muted p-[3px] sm:ml-auto">
            {(['list', 'table'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`h-7 rounded-md px-2.5 text-[13px] font-medium capitalize transition-colors ${
                  view === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          {/* The primary action ends the filter row instead of sitting alone above it. */}
          {canCreate && (
            <Button
              className="h-9"
              onClick={() =>
                router.push(
                  effectiveInstitution ? `/procurement/requests/new?institution=${effectiveInstitution}` : '/procurement/requests/new'
                )
              }
            >
              <Plus className="mr-1.5 h-4 w-4" />
              New request
            </Button>
          )}
        </div>

        {/* Rows read like a sentence: what · number · college · who · stage. Rows that
            need this viewer are lightly tinted. */}
        <section className="overflow-hidden rounded-xl border bg-background shadow">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <BeatLoader color="hsl(var(--primary))" size={10} />
            </div>
          ) : isError ? (
            <div className="px-6 py-12">
              <AlertBox type="error" message="Failed to load purchases. Please try again." />
            </div>
          ) : shown.length === 0 ? (
            <EmptyState
              title={waitingForMe ? 'Nothing is waiting for you' : 'No requests found'}
              description={waitingForMe ? 'Requests that need your approval appear here.' : 'Requests you raise, or that are routed to you, appear here.'}
            />
          ) : view === 'table' ? (
            <ResponsiveList
              rows={shown}
              getRowKey={(req) => req.id}
              onRowClick={(req) => router.push(`/procurement/requests/${req.id}`)}
              rowLabel={(req) => `Open purchase ${[req.title, displayRequestNumber(req.request_number)].filter(Boolean).join(' ')}`}
              columns={[
                {
                  key: 'request',
                  header: 'Request',
                  mobile: 'title',
                  className: 'max-w-[280px] truncate',
                  cell: (req) => (
                    <>
                      <span className="font-medium">{req.title || whatIsNeeded(req)}</span>
                      {req.title && <span className="font-normal text-muted-foreground"> · {whatIsNeeded(req)}</span>}
                    </>
                  ),
                },
                { key: 'no', header: 'Purchase no.', className: 'whitespace-nowrap', cell: (req) => displayRequestNumber(req.request_number) },
                {
                  key: 'college',
                  header: 'College',
                  className: 'max-w-[200px] truncate',
                  cell: (req) => collegeName(req.institution_id) ?? '—',
                },
                { key: 'by', header: 'Raised by', className: 'whitespace-nowrap', cell: (req) => req.requested_by_profile?.full_name ?? '—' },
                { key: 'date', header: 'Date', className: 'whitespace-nowrap', cell: (req) => formatDateDMY(req.created_at) },
                {
                  key: 'status',
                  header: 'Status',
                  mobile: 'badge',
                  cell: (req) => <StatusBadge status={stageOf(req)} config={STAGE_CONFIG} />,
                },
                {
                  key: 'act',
                  header: '',
                  mobile: 'hidden',
                  className: 'text-right',
                  cell: (req) => {
                    const mine = yourTurn(req);
                    return (
                      <span
                        className={`inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-medium ${
                          mine ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {mine ? 'Review' : 'Open'}
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    );
                  },
                },
              ]}
            />
          ) : (
            <ul>
              {shown.map((req) => {
                const mine = yourTurn(req);
                const stage = stageOf(req);
                const closed = stage === 'received' || stage === 'rejected' || stage === 'cancelled';
                return (
                  <li key={req.id} className="relative border-b last:border-b-0">
                    <button
                      type="button"
                      onClick={() => router.push(`/procurement/requests/${req.id}`)}
                      aria-label={`Open purchase ${[req.title, displayRequestNumber(req.request_number)].filter(Boolean).join(' ')}`}
                      className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-2 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:grid-cols-[minmax(0,1.6fr)_minmax(220px,1fr)_auto]`}
                    >
                      <span className="col-span-2 min-w-0 md:col-span-1">
                        <span className="block truncate font-semibold">
                          {req.title || whatIsNeeded(req)}
                          {req.title && <span className="font-normal text-muted-foreground"> · {whatIsNeeded(req)}</span>}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[
                            displayRequestNumber(req.request_number),
                            allColleges ? collegeName(req.institution_id) : null,
                            req.requested_by_profile?.full_name,
                            formatDateDMY(req.created_at),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>

                      <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5">
                        <StatusBadge status={stage} config={STAGE_CONFIG} />
                        {!closed && (
                          <span className="truncate text-xs text-muted-foreground">
                            Waiting on {mine ? 'you' : WAITING_ON[stage] ?? 'the team'}
                          </span>
                        )}
                      </span>

                      <span
                        className={`inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-medium ${
                          mine ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {mine ? 'Review' : 'Open'}
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </ContentLayout>
  );
}
