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
import { STAGE_CONFIG, stageOf } from '@/lib/procurement/purchase-stage';
import { type ProcurementPurchaseRequest, type PurchaseRequestFilters } from '@/types/procurement';
import { Checkbox } from '@/components/ui/checkbox';
import { useProcurementOverviewCounts } from '@/hooks/procurement/use-overview-counts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search } from 'lucide-react';
import { BeatLoader } from 'react-spinners';

/** "Keyboard × 5" · "Keyboard × 5, Mouse × 2" · "Keyboard × 5 + 3 more" */
function whatIsNeeded(req: ProcurementPurchaseRequest): string {
  const items = req.item_preview ?? [];
  if (!items.length) return `${req.item_count ?? 0} item${req.item_count === 1 ? '' : 's'}`;
  const fmt = (i: { item_name: string; required_quantity: number }) => `${i.item_name} × ${Number(i.required_quantity)}`;
  if (items.length <= 2) return items.map(fmt).join(', ');
  return `${fmt(items[0])} + ${items.length - 1} more`;
}

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
  // The Overview status bars link here with ?institution=<id|all>&status=<status>.
  const [stageFilter, setStageFilter] = useState<string>(() => {
    const raw = searchParams.get('stage') ?? searchParams.get('status');
    return raw ? LEGACY_STATUS_TO_STAGE[raw] ?? raw : 'all';
  });
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
    stage: stageFilter !== 'all' ? stageFilter : undefined,
    institution_id: allColleges ? undefined : effectiveInstitution,
    all_institutions: allColleges,
    requested_by: mineOnly ? profile?.id : undefined,
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

  // Counts per stage for the chips (same numbers as the Overview, RLS-scoped).
  const { data: countRows = [] } = useProcurementOverviewCounts(7);
  const stageCount = (gate: number) =>
    countRows
      .filter((r) => r.gate === gate && (allColleges || r.institution_id === effectiveInstitution))
      .reduce((n, r) => n + r.pending, 0);
  const CHIPS: Array<{ value: string; label: string; count?: number }> = [
    { value: 'all', label: 'All' },
    { value: 'submitted', label: 'Item approval', count: stageCount(1) },
    { value: 'getting_quotes', label: 'Getting quotes', count: stageCount(2) },
    { value: 'with_super_admin', label: 'Final approval', count: stageCount(3) },
    { value: 'ordered', label: 'Ordered', count: stageCount(4) },
    { value: 'received', label: 'Received' },
    { value: 'rejected', label: 'Rejected' },
  ];

  // Whose move it is, from this viewer's point of view.
  const yourTurn = (req: ProcurementPurchaseRequest) => {
    const st = stageOf(req);
    if (st === 'submitted') return (isSuperAdmin || canAccess('procurement', 'request_approve')) && req.requested_by !== profile?.id;
    if (st === 'with_super_admin') return isSuperAdmin;
    if (st === 'getting_quotes') return isSuperAdmin || canAccess('procurement', 'quotation_manage');
    return false;
  };

  return (
    <ContentLayout title="Requests">
      <div className="mx-auto w-full max-w-3xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Requests</h1>
          {canCreate && (
            <Button
              className="h-10"
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
        </header>

        {/* Stage chips with counts replace the stage drop-down: one tap filters. */}
        <nav aria-label="Stage" className="flex flex-wrap gap-2">
          {CHIPS.map((c) => {
            const on = stageFilter === c.value;
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={on}
                onClick={() => setStageFilter(c.value)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors ${
                  on ? 'border-foreground bg-foreground text-background' : 'bg-card hover:border-foreground/40'
                }`}
              >
                {c.label}
                {c.count ? <b className="tabular-nums">{c.count}</b> : null}
              </button>
            );
          })}
        </nav>

        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search item, purchase no. or title"
              aria-label="Search purchases"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 pl-9"
            />
          </div>
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border bg-card px-3 text-sm">
            <Checkbox checked={mineOnly} onCheckedChange={(v) => setMineOnly(v === true)} />
            Raised by me
          </label>
          <InstitutionFilter
            value={allColleges ? 'all' : effectiveInstitution}
            onChange={setInstitutionId}
            allLabel="All colleges"
            label={null}
            className="w-full sm:w-52 [&_button]:h-10"
          />
        </div>

        {/* Rows read like a sentence: what · number · college · who · stage. Rows that
            need this viewer are lightly tinted. */}
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <BeatLoader color="hsl(var(--primary))" size={10} />
            </div>
          ) : isError ? (
            <div className="px-6 py-12">
              <AlertBox type="error" message="Failed to load purchases. Please try again." />
            </div>
          ) : requests.length === 0 ? (
            <EmptyState title="No requests found" description="Requests you raise, or that are routed to you, appear here." />
          ) : (
            <ul>
              {requests.map((req) => {
                const mine = yourTurn(req);
                return (
                  <li key={req.id} className="border-b last:border-b-0">
                    <button
                      type="button"
                      onClick={() => router.push(`/procurement/requests/${req.id}`)}
                      aria-label={`Open purchase ${[req.title, displayRequestNumber(req.request_number)].filter(Boolean).join(' ')}`}
                      className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                        mine ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''
                      }`}
                    >
                      <span className="min-w-0 flex-1 basis-64">
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
                      <StatusBadge status={stageOf(req)} config={STAGE_CONFIG} />
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
